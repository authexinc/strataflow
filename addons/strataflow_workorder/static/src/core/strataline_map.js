import { Component, onMounted, onWillUnmount, useEffect, useRef, useState } from "@odoo/owl";
import { loadCSS, loadJS } from "@web/core/assets";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { FauxMap } from "./faux_map";
import { EXCLUDED_SUBS, hiddenState, ownRow, registerRows, rowsFromManifest, useLayers } from "./layers";
import { geoDrawing, segMetres } from "./locate_geo";
import { useTheme } from "./theme";

// MapLibre is 1 MB and only the map screens need it, so it is fetched on first use rather
// than bundled. 5.x is the last line with a UMD build; 6.x is ESM-only, which Odoo's asset
// pipeline and loadJS() cannot load. Vendored under static/lib, see the README there.
const LIB = "/strataflow_workorder/static/lib/maplibre-gl/maplibre-gl";
// Esri World Imagery, the same satellite source strataline itself draws; it is imagery, not
// UI chrome, so the self-hosting rule for fonts does not apply.
const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
// Calgary until a tenant's tickets say otherwise: matches CALGARY in geo.js
const HOME = { center: [-114.08, 51.045], zoom: 11 };
const FONT = ["Noto Sans Regular"];
const MIN_SEGMENT_M = 0.5;

// Strataflow's own basemap palette, derived from the shell tokens (--bg, --map-line,
// --map-block) so the live ground matches the faux one the shell already draws behind
// every screen. Muted on purpose: tickets, crews and utility lines are the information.
const GROUND = {
    // label on earth: 5.3:1 light, 5.9:1 dark — labels are 9.5–12px, so AA needs 4.5:1
    light: { earth: "#f4f5f3", landuse: "#e7ece2", water: "#d5e2ea", buildings: "#e8e9e5", minor: "#dfe1de", major: "#d3d6d2", highway: "#c7cbc6", label: "#5f666d", halo: "#f4f5f3", ink: "#1a1d21", grid: "rgba(122,92,196,.55)", gridText: "#6b5aa0" },
    dark: { earth: "#14181d", landuse: "#181f1a", water: "#172430", buildings: "#1b2027", minor: "#232a31", major: "#2a323a", highway: "#343d46", label: "#8b969e", halo: "#14181d", ink: "#e8ecee", grid: "rgba(160,135,220,.6)", gridText: "#a99ad8" },
};

let libPromise = null;
let configPromise = null;
let assetsPromise = null;

/** The tenant's map configuration, fetched once per page for every screen that asks. */
export function mapConfig(orm) {
    if (!configPromise) {
        configPromise = orm.call("strataflow.workorder", "get_map_config", []);
    }
    return configPromise;
}

function loadLib() {
    if (!libPromise) {
        libPromise = Promise.all([loadCSS(`${LIB}.css`), loadJS(`${LIB}.js`)]).then(() => window.maplibregl);
    }
    return libPromise;
}

function keyed(base, path, key) {
    return `${base}${path}?key=${encodeURIComponent(key)}`;
}

// style, manifest and meta once per page: they change when strataline deploys, not per screen
function loadAssets(cfg) {
    if (!assetsPromise) {
        const get = (path) => fetch(keyed(cfg.base_url, path, cfg.api_key)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        assetsPromise = Promise.all([get("/style.json"), get("/layers.json"), get("/tiles/meta")]).then(([utilities, manifest, meta]) => ({ utilities, manifest, meta }));
    }
    return assetsPromise;
}

function roadWidth(z0, w0, z1, w1) {
    return ["interpolate", ["exponential", 1.6], ["zoom"], z0, w0, z1, w1];
}

// ---- this client's own layers: basemap, ATS grid, addresses ---------------------------------

function basemapLayers(g) {
    const road = (id, kinds, color, width) => ({
        id, type: "line", source: "basemap", "source-layer": "roads",
        filter: ["in", ["get", "kind"], ["literal", kinds]],
        paint: { "line-color": color, "line-width": width },
    });
    const text = (id, sl, kinds, size, extra = {}) => ({
        id, type: "symbol", source: "basemap", "source-layer": sl,
        filter: ["in", ["get", "kind"], ["literal", kinds]],
        layout: { "text-field": ["get", "name"], "text-size": size, "text-font": FONT, ...(extra.layout || {}) },
        paint: { "text-color": g.label, "text-halo-color": g.halo, "text-halo-width": 1.2 },
        ...(extra.minzoom ? { minzoom: extra.minzoom } : {}),
    });
    return [
        { id: "sf_earth", type: "fill", source: "basemap", "source-layer": "earth", paint: { "fill-color": g.earth } },
        { id: "sf_landuse", type: "fill", source: "basemap", "source-layer": "landuse",
          filter: ["in", ["get", "kind"], ["literal", ["park", "forest", "grass", "cemetery", "golf_course", "nature_reserve", "wood", "protected_area", "village_green", "allotments", "farmland", "meadow"]]],
          paint: { "fill-color": g.landuse } },
        { id: "sf_water", type: "fill", source: "basemap", "source-layer": "water", paint: { "fill-color": g.water } },
        { id: "sf_buildings", type: "fill", source: "basemap", "source-layer": "buildings", paint: { "fill-color": g.buildings } },
        road("sf_roads_minor", ["minor_road", "other", "path"], g.minor, roadWidth(12, 0.5, 18, 8)),
        road("sf_roads_major", ["major_road"], g.major, roadWidth(10, 0.8, 18, 14)),
        road("sf_roads_highway", ["highway"], g.highway, roadWidth(8, 1.2, 18, 20)),
        text("sf_road_labels", "roads", ["highway", "major_road"], 10.5, { layout: { "symbol-placement": "line" } }),
        text("sf_road_labels_minor", "roads", ["minor_road", "other", "path"], 9.5, { layout: { "symbol-placement": "line" }, minzoom: 13 }),
        text("sf_place_labels", "places", ["locality", "neighbourhood", "suburb"], 12),
    ];
}

// the grid is reference, not information: each level appears only once it is coarse enough
// on screen to read, and never louder than the roads
const ATS = [
    { id: "ats_twp", minzoom: 8, width: 1.2, opacity: 0.55, label: 9.5, name: _t("ATS townships") },
    { id: "ats_sec", minzoom: 12, width: 0.8, opacity: 0.45, label: 12.5, name: _t("ATS sections") },
    { id: "ats_qtr", minzoom: 13.5, width: 0.6, opacity: 0.4, label: 14, name: _t("ATS quarter sections") },
    { id: "ats_lsd", minzoom: 14.5, width: 0.4, opacity: 0.35, label: 15, name: _t("ATS LSDs") },
];

function atsLayers(g) {
    const out = [];
    for (const a of ATS) {
        out.push({ id: a.id, type: "line", source: "ats", "source-layer": a.id, minzoom: a.minzoom, paint: { "line-color": g.grid, "line-width": a.width, "line-opacity": a.opacity } });
        out.push({
            id: `${a.id}_label`, type: "symbol", source: "ats", "source-layer": `${a.id}_label`, minzoom: a.label,
            layout: { "text-field": ["get", "lbl"], "text-size": 10, "text-font": FONT, "text-allow-overlap": false },
            paint: { "text-color": g.gridText, "text-halo-color": g.halo, "text-halo-width": 1.2 },
        });
    }
    return out;
}

function addrLayer(g) {
    return {
        id: "sf_addr", type: "symbol", source: "addr", "source-layer": "addr_label", minzoom: 16,
        layout: { "text-field": ["get", "n"], "text-size": 10, "text-font": FONT, "text-allow-overlap": false },
        paint: { "text-color": g.label, "text-halo-color": g.halo, "text-halo-width": 1.2 },
    };
}

function ownRows(g) {
    return [
        ownRow("sf_earth", "Basemap", "fill", g.earth, _t("Land")),
        ownRow("sf_landuse", "Basemap", "fill", g.landuse, _t("Parks & green")),
        ownRow("sf_water", "Basemap", "fill", g.water, _t("Water")),
        ownRow("sf_buildings", "Basemap", "fill", g.buildings, _t("Buildings")),
        ownRow("sf_roads_minor", "Basemap", "line", g.minor, _t("Minor roads"), { twins: ["sf_road_labels_minor"] }),
        ownRow("sf_roads_major", "Basemap", "line", g.major, _t("Major roads")),
        ownRow("sf_roads_highway", "Basemap", "line", g.highway, _t("Highways")),
        ownRow("sf_road_labels", "Basemap", "label", g.label, _t("Road names")),
        ownRow("sf_place_labels", "Basemap", "label", g.label, _t("Place names")),
        ...ATS.map((a) => ownRow(a.id, "Reference", "line", g.grid, a.name, { twins: [`${a.id}_label`] })),
        ownRow("sf_addr", "Reference", "label", g.label, _t("House numbers")),
    ];
}

/**
 * Assemble the MapLibre style for one theme and basemap. Strataline supplies the data
 * (basemap, utilities and their style, ATS grid, addresses, glyphs); the ground palette is
 * Strataflow's own. Returns the style and the utility layers' baked filters, which
 * setFilter() replaces and the visibility pass must therefore restate.
 */
function buildStyle({ theme, basemap, cfg, utilities, meta }) {
    const { base_url: base, api_key: key } = cfg;
    const g = GROUND[theme] || GROUND.light;
    // /tiles/meta is scoped to the key: a source it lists as null sits wholly outside the
    // key's zoom or area and must not be asked for
    const available = (name) => !meta || meta[name] !== null;
    const src = (name, extra = {}) => ({
        type: "vector", tiles: [keyed(base, `/tiles/${name}/{z}/{x}/{y}.pbf`, key)],
        ...(meta?.[name] ? { minzoom: meta[name].minzoom, maxzoom: meta[name].maxzoom, bounds: meta[name].bounds } : {}),
        ...extra,
    });
    const style = {
        version: 8,
        glyphs: keyed(base, "/fonts/{fontstack}/{range}.pbf", key),
        sources: {
            basemap: src("basemap", { attribution: "© OpenStreetMap contributors" }),
            sat: { type: "raster", tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: "© Esri" },
        },
        layers: [{ id: "sf_bg", type: "background", paint: { "background-color": basemap === "satellite" ? "#232a22" : g.earth } }],
    };
    if (basemap === "satellite") {
        style.layers.push({ id: "sf_sat", type: "raster", source: "sat", paint: { "raster-saturation": -0.15 } });
    } else {
        style.layers.push(...basemapLayers(g));
    }
    if (available("ats")) {
        style.sources.ats = src("ats");
        style.layers.push(...atsLayers(g));
    }
    const baked = {};
    // the utility style as strataline serves it: its own source, its own layers, its own
    // colours (the industry colour code). Only the tile URLs are ours to rewrite.
    if (utilities) {
        for (const [name, s] of Object.entries(utilities.sources || {})) {
            style.sources[name] = { ...s, tiles: (s.tiles || [`/tiles/${name}/{z}/{x}/{y}.pbf`]).map((u) => keyed(base, u.startsWith("/") ? u : `/${u}`, key)) };
            if (meta?.[name]) {
                Object.assign(style.sources[name], { minzoom: meta[name].minzoom, maxzoom: meta[name].maxzoom, bounds: meta[name].bounds });
            }
        }
        for (const l of utilities.layers || []) {
            if (l.type === "background") {
                continue;
            }
            const layer = JSON.parse(JSON.stringify(l));
            if (theme === "dark" && layer.metadata?.dark) {
                Object.assign(layer.paint || (layer.paint = {}), layer.metadata.dark);
            }
            baked[layer.id] = layer.filter;
            style.layers.push(layer);
        }
    }
    if (available("addr")) {
        style.sources.addr = src("addr");
        style.layers.push(addrLayer(g));
    }
    return { style, baked };
}

/**
 * The live Strataline map: tickets as glass pins, suggested routes as dashed lines, the
 * selected ticket labelled, the locate print as a geo-referenced layer that can be drawn on.
 * Pan and zoom are the map's own. When the tenant has no Strataline key yet, the faux ground
 * stands in and says so.
 *
 * markers: [{ id, latitude, longitude, status, emergency, on, badge?, name, address }]
 * routes:  [{ id, color, coords: [[lng, lat], …] }]
 * drawing: { v: 2, segments: [{ a, b, util }], notes: [{ at, text }] } — see locate_geo.js
 * tool:    a utility code or "note" to draw with; false to pan
 */
export class StratalineMap extends Component {
    static template = "strataflow_workorder.StratalineMap";
    static components = { FauxMap };
    static props = {
        markers: { type: Array, optional: true },
        routes: { type: Array, optional: true },
        basemap: { type: String, optional: true }, // streets | satellite
        focus: { type: [Number, Boolean], optional: true }, // marker id to keep in view
        padding: { type: Object, optional: true }, // viewport padding, px — where the panels sit
        zoom: { type: Number, optional: true }, // zoom for a single marker (a bbox fit sets its own)
        drawing: { type: Object, optional: true },
        tool: { type: [String, Boolean], optional: true },
        utils: { type: Array, optional: true }, // [{code, name, color}] for the drawing's colours
        onDraw: { type: Function, optional: true },
        onSelect: { type: Function, optional: true },
        onReady: { type: Function, optional: true }, // receives { zoomIn, zoomOut }
    };
    static defaultProps = { markers: [], routes: [], basemap: "streets", padding: { top: 90, left: 40, right: 80, bottom: 70 }, zoom: 14, tool: false, utils: [] };

    setup() {
        this.orm = useService("orm");
        this.theme = useTheme();
        this.layers = useLayers();
        this.el = useRef("map");
        this.noteRef = useRef("note");
        this.state = useState({ status: "loading", message: "", noteDraft: null, notePx: { x: 0, y: 0 } }); // loading | live | off | error
        this.map = null;
        this.marks = new Map(); // id -> { marker, el }
        this.label = null;
        this.fitted = false;
        this.live = null; // the segment being dragged out
        onMounted(() => this.boot());
        onWillUnmount(() => this.map?.remove());
        // style follows the theme toggle and the basemap switch
        useEffect(
            () => {
                if (this.map) {
                    this.styleReady = false;
                    this.map.setStyle(this.style(), { diff: false });
                }
            },
            () => [this.theme.theme, this.props.basemap]
        );
        useEffect(
            () => {
                this.syncMarkers();
                this.syncRoutes();
            },
            () => [this.props.markers, this.props.routes, this.map]
        );
        useEffect(
            () => this.applyVisibility(),
            () => [this.layers.version, this.map]
        );
        useEffect(
            () => this.keepInView(this.props.focus),
            () => [this.props.focus, this.map]
        );
        useEffect(
            () => this.setTool(this.props.tool),
            () => [this.props.tool, this.map]
        );
        useEffect(
            () => this.syncDrawing(),
            () => [this.props.drawing, this.props.utils, this.map]
        );
        // the note input exists only after the render that follows the click: focus it then
        useEffect(
            () => this.noteRef.el?.focus(),
            () => [this.state.noteDraft]
        );
    }

    get connected() {
        return this.state.status === "live";
    }

    async boot() {
        try {
            this.cfg = await mapConfig(this.orm);
            if (!this.cfg.connected) {
                this.state.status = "off";
                this.state.message = _t("Strataline not connected — set the API key in Settings");
                return;
            }
            const [maplibregl, assets] = await Promise.all([loadLib(), loadAssets(this.cfg)]);
            this.gl = maplibregl;
            Object.assign(this, assets); // utilities, manifest, meta
            if (!this.el.el) {
                return; // unmounted while loading
            }
            registerRows([...rowsFromManifest(this.manifest), ...ownRows(GROUND[this.theme.theme] || GROUND.light)]);
            const map = new maplibregl.Map({
                container: this.el.el,
                style: this.style(),
                center: HOME.center,
                zoom: HOME.zoom,
                attributionControl: false,
            });
            map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© Strataline" }), "bottom-right");
            // Not `map.isStyleLoaded()` as the guard: that is false whenever any tile is still
            // streaming, so an update arriving mid-load would be dropped and never retried.
            // "style.load" fires once per setStyle, which is exactly when layers can be added.
            map.on("style.load", () => {
                this.styleReady = true;
                this.syncRoutes();
                this.syncDrawing();
                this.applyVisibility();
            });
            map.on("error", (ev) => {
                // a refused request is a key problem, not a crash: 401 means the key itself is bad
                // and the user should hear it; a 403 is a scope refusal at the edge of the key's
                // area or zoom (strataline's /tiles/meta clamps both, so it should be rare) and only
                // worth the console; 404 is an empty tile.
                const status = ev?.error?.status;
                if (status === 401) {
                    this.state.message = _t("Strataline rejected the API key — check Settings");
                } else if (status && status !== 404) {
                    console.warn("strataline", status, ev.error.url || "");
                }
            });
            this.bindDraw(map);
            this.map = map;
            this.state.status = "live";
            this.props.onReady?.({ zoomIn: () => map.zoomIn(), zoomOut: () => map.zoomOut() });
            this.syncMarkers();
            this.fit();
        } catch (err) {
            this.state.status = "error";
            this.state.message = _t("The map could not load.");
            console.error("strataline map", err);
        }
    }

    style() {
        const { style, baked } = buildStyle({ theme: this.theme.theme, basemap: this.props.basemap, cfg: this.cfg, utilities: this.utilities, meta: this.meta });
        this.baked = baked;
        return style;
    }

    get ground() {
        return GROUND[this.theme.theme] || GROUND.light;
    }

    get reducedMotion() {
        return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    }

    // ---- layer visibility (the layer panel's store, applied to the style) ------------------

    applyVisibility() {
        const map = this.map;
        if (!map || !this.styleReady) {
            return;
        }
        const { merged, own } = hiddenState();
        // strataline's merged layers: many datasets in one style layer, told apart by
        // `sub_layer`. setFilter replaces the baked filter (the abandoned split, pipeline
        // exclusions), so it is restated as the first clause every time.
        for (const [m, { all, hidden }] of Object.entries(merged)) {
            for (const id of [m, `${m}__abandoned`]) {
                if (!map.getLayer(id)) {
                    continue;
                }
                map.setLayoutProperty(id, "visibility", hidden.length === all.length ? "none" : "visible");
                const clause = ["!", ["in", ["get", "sub_layer"], ["literal", [...EXCLUDED_SUBS, ...hidden]]]];
                map.setFilter(id, this.baked?.[id] ? ["all", this.baked[id], clause] : clause);
            }
        }
        for (const r of this.layers.rows) {
            if (r.parts) {
                continue;
            }
            const on = !own.includes(r.id);
            for (const id of [r.id, ...(r.twins || [])]) {
                if (map.getLayer(id)) {
                    map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
                }
            }
        }
    }

    // ---- markers ----------------------------------------------------------------

    static pinEl(m) {
        const wrap = document.createElement("div");
        wrap.className = "o_sf_mk";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "o_sf_pin";
        btn.title = `${m.name} · ${m.address}`;
        const dot = document.createElement("span");
        dot.setAttribute("aria-hidden", "true");
        btn.append(dot);
        wrap.append(btn);
        return wrap;
    }

    static paint(el, m) {
        const btn = el.firstChild;
        btn.classList.toggle("is-on", !!m.on);
        btn.classList.toggle("is-emergency", !!m.emergency);
        btn.setAttribute("aria-pressed", m.on ? "true" : "false");
        btn.firstChild.className = `o_sf_dot o_sf_dot--${m.status}`;
        let badge = btn.querySelector(".o_sf_pin_crew");
        if (m.badge && !badge) {
            badge = document.createElement("span");
            badge.className = "o_sf_pin_crew";
            btn.append(badge);
        }
        if (badge) {
            badge.textContent = m.badge || "";
            badge.hidden = !m.badge;
        }
    }

    syncMarkers() {
        const map = this.map;
        if (!map) {
            return;
        }
        const seen = new Set();
        let selected = null;
        for (const m of this.props.markers) {
            if (!m.latitude || !m.longitude) {
                continue;
            }
            seen.add(m.id);
            let entry = this.marks.get(m.id);
            if (!entry) {
                const el = StratalineMap.pinEl(m);
                el.firstChild.addEventListener("click", (ev) => {
                    ev.stopPropagation();
                    this.props.onSelect?.(m.id);
                });
                const marker = new this.gl.Marker({ element: el, anchor: "center" }).setLngLat([m.longitude, m.latitude]).addTo(map);
                entry = { marker, el };
                this.marks.set(m.id, entry);
            } else {
                entry.marker.setLngLat([m.longitude, m.latitude]);
            }
            StratalineMap.paint(entry.el, m);
            entry.el.style.zIndex = m.on ? 2 : 1;
            if (m.on) {
                selected = m;
            }
        }
        for (const [id, entry] of this.marks) {
            if (!seen.has(id)) {
                entry.marker.remove();
                this.marks.delete(id);
            }
        }
        this.syncLabel(selected);
        // a wholly different set of tickets (the Locator's on-site map moving to the next stop)
        // is a new subject: frame it again. A changed selection within the same set is not.
        if (this.shownIds?.size && ![...seen].some((id) => this.shownIds.has(id))) {
            this.fitted = false;
        }
        this.shownIds = seen;
        if (!this.fitted && seen.size) {
            this.fit();
        }
    }

    syncLabel(m) {
        if (!m) {
            this.label?.remove();
            this.label = null;
            return;
        }
        if (!this.label) {
            const el = document.createElement("div");
            el.className = "o_sf_pin_label";
            el.append(document.createElement("span"), document.createElement("b"));
            el.firstChild.className = "o_sf_mono o_sf_note";
            // position before addTo: MapLibre reads the LngLat when the marker joins the map
            this.label = new this.gl.Marker({ element: el, anchor: "left", offset: [22, 0] }).setLngLat([m.longitude, m.latitude]).addTo(this.map);
        }
        const el = this.label.getElement();
        el.firstChild.textContent = m.name;
        el.lastChild.textContent = m.address;
        this.label.setLngLat([m.longitude, m.latitude]);
    }

    // ---- routes -------------------------------------------------------------------

    syncRoutes() {
        const map = this.map;
        if (!map || !this.styleReady) {
            return;
        }
        const data = {
            type: "FeatureCollection",
            features: this.props.routes.filter((r) => r.coords?.length > 1).map((r) => ({
                type: "Feature", properties: { color: r.color }, geometry: { type: "LineString", coordinates: r.coords },
            })),
        };
        if (map.getSource("sf_routes")) {
            map.getSource("sf_routes").setData(data);
            return;
        }
        map.addSource("sf_routes", { type: "geojson", data });
        map.addLayer({
            id: "sf_routes", type: "line", source: "sf_routes",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": ["get", "color"], "line-width": 3.5, "line-dasharray": [2.5, 1.8], "line-opacity": 0.85 },
        });
    }

    // ---- the locate print: a geo-referenced layer, drawn on with pointer drags ---------------

    utilColor(code) {
        return this.props.utils.find((u) => u.code === code)?.color || this.ground.ink;
    }

    utilLetter(code) {
        return (this.props.utils.find((u) => u.code === code)?.name || "?")[0];
    }

    drawingData() {
        const d = geoDrawing(this.props.drawing);
        const line = (s, live) => ({
            type: "Feature",
            properties: { color: this.utilColor(s.util), dashed: s.util === "gas", live, label: `${this.utilLetter(s.util)} ${segMetres(s).toFixed(1)} m` },
            geometry: { type: "LineString", coordinates: [s.a, s.b] },
        });
        const features = d.segments.map((s) => line(s, false));
        if (this.live) {
            features.push(line(this.live, true));
        }
        for (const n of d.notes) {
            features.push({ type: "Feature", properties: { text: n.text }, geometry: { type: "Point", coordinates: n.at } });
        }
        return { type: "FeatureCollection", features };
    }

    syncDrawing() {
        const map = this.map;
        if (!map || !this.styleReady) {
            return;
        }
        const data = this.drawingData();
        if (map.getSource("sf_locate")) {
            map.getSource("sf_locate").setData(data);
            return;
        }
        const g = this.ground;
        const isLine = ["==", ["geometry-type"], "LineString"];
        map.addSource("sf_locate", { type: "geojson", data });
        map.addLayer({
            id: "sf_locate_line", type: "line", source: "sf_locate", filter: ["all", isLine, ["!", ["get", "dashed"]]],
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": ["get", "color"], "line-width": 3.5, "line-opacity": ["case", ["get", "live"], 0.6, 1] },
        });
        // gas is the dotted one, as on the print; line-dasharray cannot vary per feature
        map.addLayer({
            id: "sf_locate_line_gas", type: "line", source: "sf_locate", filter: ["all", isLine, ["get", "dashed"]],
            layout: { "line-cap": "round" },
            paint: { "line-color": ["get", "color"], "line-width": 3.5, "line-dasharray": [0.1, 2.2], "line-opacity": ["case", ["get", "live"], 0.6, 1] },
        });
        // colour alone must not carry the utility: the label leads with the class letter
        map.addLayer({
            id: "sf_locate_label", type: "symbol", source: "sf_locate", filter: isLine,
            layout: { "symbol-placement": "line-center", "text-field": ["get", "label"], "text-size": 11, "text-font": FONT, "text-offset": [0, -1.1], "text-allow-overlap": true, "text-ignore-placement": true },
            paint: { "text-color": ["get", "color"], "text-halo-color": g.halo, "text-halo-width": 2 },
        });
        map.addLayer({
            id: "sf_locate_note_dot", type: "circle", source: "sf_locate", filter: ["==", ["geometry-type"], "Point"],
            paint: { "circle-radius": 4.5, "circle-color": g.ink, "circle-stroke-color": g.halo, "circle-stroke-width": 1.5 },
        });
        map.addLayer({
            id: "sf_locate_note", type: "symbol", source: "sf_locate", filter: ["==", ["geometry-type"], "Point"],
            layout: { "text-field": ["get", "text"], "text-size": 11, "text-font": FONT, "text-anchor": "left", "text-offset": [0.8, 0], "text-allow-overlap": true, "text-ignore-placement": true },
            paint: { "text-color": g.ink, "text-halo-color": g.halo, "text-halo-width": 2 },
        });
    }

    bindDraw(map) {
        const down = (e) => this.drawDown(e);
        const move = (e) => this.drawMove(e);
        const up = () => this.drawUp();
        const cancel = () => this.drawCancel();
        map.on("mousedown", down);
        map.on("mousemove", move);
        map.on("mouseup", up);
        map.on("mouseout", cancel);
        map.on("touchstart", down);
        map.on("touchmove", move);
        map.on("touchend", up);
        map.on("touchcancel", cancel);
        map.on("move", () => this.trackNote());
    }

    setTool(tool) {
        const map = this.map;
        if (!map) {
            return;
        }
        this.tool = tool;
        if (tool) {
            map.dragPan.disable();
            map.doubleClickZoom.disable();
            map.getCanvas().style.cursor = "crosshair";
        } else {
            map.dragPan.enable();
            map.doubleClickZoom.enable();
            map.getCanvas().style.cursor = "";
            this.drawCancel();
            this.state.noteDraft = null;
        }
    }

    drawDown(e) {
        if (!this.tool) {
            return;
        }
        const button = e.originalEvent?.button;
        if (button !== undefined && button !== 0) {
            return;
        }
        e.preventDefault();
        const at = [e.lngLat.lng, e.lngLat.lat];
        if (this.tool === "note") {
            this.state.noteDraft = { at, text: "" };
            this.trackNote();
            return;
        }
        this.live = { a: at, b: at, util: this.tool };
        this.syncDrawing();
    }

    drawMove(e) {
        if (!this.live) {
            return;
        }
        e.preventDefault();
        this.live = { ...this.live, b: [e.lngLat.lng, e.lngLat.lat] };
        this.syncDrawing();
    }

    drawUp() {
        const live = this.live;
        if (!live) {
            return;
        }
        this.live = null;
        if (segMetres(live) >= MIN_SEGMENT_M) {
            const d = geoDrawing(this.props.drawing);
            this.props.onDraw?.({ ...d, segments: [...d.segments, live] });
        } else {
            this.syncDrawing();
        }
    }

    drawCancel() {
        if (this.live) {
            this.live = null;
            this.syncDrawing();
        }
    }

    // the note input is plain DOM over the map: keep it on its point while the map moves
    trackNote() {
        if (this.state.noteDraft && this.map) {
            const p = this.map.project(this.state.noteDraft.at);
            this.state.notePx = { x: Math.round(p.x), y: Math.round(p.y) };
        }
    }

    commitNote() {
        const draft = this.state.noteDraft;
        if (!draft) {
            return;
        }
        this.state.noteDraft = null;
        const text = draft.text.trim();
        if (text) {
            const d = geoDrawing(this.props.drawing);
            this.props.onDraw?.({ ...d, notes: [...d.notes, { at: draft.at, text }] });
        }
    }

    onNoteKeydown(ev) {
        if (ev.key === "Enter") {
            ev.preventDefault();
            this.commitNote();
        } else if (ev.key === "Escape") {
            this.state.noteDraft = null;
        }
    }

    // ---- view -----------------------------------------------------------------------

    fit() {
        const pts = this.props.markers.filter((m) => m.latitude && m.longitude);
        if (!this.map || !pts.length) {
            return;
        }
        this.fitted = true;
        if (pts.length === 1) {
            this.map.jumpTo({ center: [pts[0].longitude, pts[0].latitude], zoom: this.props.zoom, padding: this.props.padding });
            return;
        }
        const b = new this.gl.LngLatBounds();
        pts.forEach((m) => b.extend([m.longitude, m.latitude]));
        this.map.fitBounds(b, { padding: this.props.padding, maxZoom: 15, duration: 0 });
    }

    // Selecting from the list must not yank the map around: pan only when the selected
    // pin sits outside the part of the viewport the panels leave free.
    keepInView(id) {
        const map = this.map;
        const m = id && this.props.markers.find((x) => x.id === id);
        if (!map || !m || !m.latitude) {
            return;
        }
        const p = map.project([m.longitude, m.latitude]);
        const { top = 0, left = 0, right = 0, bottom = 0 } = this.props.padding;
        const c = map.getContainer();
        const inside = p.x > left + 40 && p.x < c.clientWidth - right - 40 && p.y > top + 40 && p.y < c.clientHeight - bottom - 40;
        if (!inside) {
            map.easeTo({ center: [m.longitude, m.latitude], padding: this.props.padding, duration: this.reducedMotion ? 0 : 450 });
        }
    }
}
