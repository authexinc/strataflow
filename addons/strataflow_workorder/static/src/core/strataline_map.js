import { Component, onMounted, onWillUnmount, useEffect, useRef, useState } from "@odoo/owl";
import { loadCSS, loadJS } from "@web/core/assets";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { FauxMap } from "./faux_map";
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

// Strataflow's own basemap palette, derived from the shell tokens (--bg, --map-line,
// --map-block) so the live ground matches the faux one the shell already draws behind
// every screen. Muted on purpose: tickets, crews and utility lines are the information.
const GROUND = {
    // label on earth: 5.3:1 light, 5.9:1 dark — labels are 9.5–12px, so AA needs 4.5:1
    light: { earth: "#f4f5f3", landuse: "#e7ece2", water: "#d5e2ea", buildings: "#e8e9e5", minor: "#dfe1de", major: "#d3d6d2", highway: "#c7cbc6", label: "#5f666d", halo: "#f4f5f3" },
    dark: { earth: "#14181d", landuse: "#181f1a", water: "#172430", buildings: "#1b2027", minor: "#232a31", major: "#2a323a", highway: "#343d46", label: "#8b969e", halo: "#14181d" },
};

let libPromise = null;
let configPromise = null;

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

function roadWidth(z0, w0, z1, w1) {
    return ["interpolate", ["exponential", 1.6], ["zoom"], z0, w0, z1, w1];
}

function basemapLayers(g) {
    const font = ["Noto Sans Regular"];
    const road = (id, kinds, color, width, extra = {}) => ({
        id, type: "line", source: "basemap", "source-layer": "roads",
        filter: ["in", ["get", "kind"], ["literal", kinds]],
        paint: { "line-color": color, "line-width": width }, ...extra,
    });
    const text = (id, sl, kinds, size, extra = {}) => ({
        id, type: "symbol", source: "basemap", "source-layer": sl,
        filter: ["in", ["get", "kind"], ["literal", kinds]],
        layout: { "text-field": ["get", "name"], "text-size": size, "text-font": font, ...(extra.layout || {}) },
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

/**
 * Assemble the MapLibre style for one theme and basemap. Strataline supplies the data
 * (basemap, utilities and their style, glyphs); the ground palette is Strataflow's own.
 */
function buildStyle({ theme, basemap, cfg, utilities, meta }) {
    const { base_url: base, api_key: key } = cfg;
    const g = GROUND[theme] || GROUND.light;
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
            style.layers.push(layer);
        }
    }
    return style;
}

/**
 * The live Strataline map: tickets as glass pins, suggested routes as dashed lines, the
 * selected ticket labelled. Pan and zoom are the map's own. When the tenant has no
 * Strataline key yet, the faux ground stands in and says so.
 *
 * markers: [{ id, latitude, longitude, status, emergency, on, badge?, name, address }]
 * routes:  [{ id, color, coords: [[lng, lat], …] }]
 */
export class StratalineMap extends Component {
    static template = "strataflow_workorder.StratalineMap";
    static components = { FauxMap };
    static props = {
        markers: { type: Array, optional: true },
        routes: { type: Array, optional: true },
        basemap: { type: String, optional: true }, // streets | satellite
        utilities: { type: Boolean, optional: true }, // utility overlay on/off
        focus: { type: [Number, Boolean], optional: true }, // marker id to keep in view
        padding: { type: Object, optional: true }, // viewport padding, px — where the panels sit
        zoom: { type: Number, optional: true }, // zoom for a single marker (a bbox fit sets its own)
        onSelect: { type: Function, optional: true },
        onReady: { type: Function, optional: true }, // receives { zoomIn, zoomOut }
    };
    static defaultProps = { markers: [], routes: [], basemap: "streets", utilities: true, padding: { top: 90, left: 40, right: 80, bottom: 70 }, zoom: 14 };

    setup() {
        this.orm = useService("orm");
        this.theme = useTheme();
        this.el = useRef("map");
        this.state = useState({ status: "loading", message: "" }); // loading | live | off | error
        this.map = null;
        this.marks = new Map(); // id -> { marker, el, key }
        this.label = null;
        this.fitted = false;
        onMounted(() => this.boot());
        onWillUnmount(() => this.map?.remove());
        // style follows the theme toggle and the basemap switch
        useEffect(
            () => {
                if (this.map) {
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
            () => this.setUtilities(this.props.utilities),
            () => [this.props.utilities, this.map]
        );
        useEffect(
            () => this.keepInView(this.props.focus),
            () => [this.props.focus, this.map]
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
            const [maplibregl, utilities, meta] = await Promise.all([
                loadLib(),
                fetch(keyed(this.cfg.base_url, "/style.json", this.cfg.api_key)).then((r) => (r.ok ? r.json() : null)),
                fetch(keyed(this.cfg.base_url, "/tiles/meta", this.cfg.api_key)).then((r) => (r.ok ? r.json() : null)),
            ]);
            this.gl = maplibregl;
            this.utilities = utilities;
            this.meta = meta;
            if (!this.el.el) {
                return; // unmounted while loading
            }
            const map = new maplibregl.Map({
                container: this.el.el,
                style: this.style(),
                center: HOME.center,
                zoom: HOME.zoom,
                attributionControl: false,
            });
            map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© Strataline" }), "bottom-right");
            map.on("style.load", () => {
                this.syncRoutes();
                this.setUtilities(this.props.utilities);
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
        return buildStyle({ theme: this.theme.theme, basemap: this.props.basemap, cfg: this.cfg, utilities: this.utilities, meta: this.meta });
    }

    get reducedMotion() {
        return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
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
        if (!map || !map.isStyleLoaded()) {
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

    // ---- view -----------------------------------------------------------------------

    setUtilities(on) {
        const map = this.map;
        if (!map || !map.isStyleLoaded() || !this.utilities) {
            return;
        }
        for (const l of this.utilities.layers || []) {
            if (l.type !== "background" && map.getLayer(l.id)) {
                map.setLayoutProperty(l.id, "visibility", on ? "visible" : "none");
            }
        }
    }

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
