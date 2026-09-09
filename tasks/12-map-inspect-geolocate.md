# 12 — Click a map feature for its attributes, and a real GPS button

Two separate features on the same map rails. First: clicking anywhere on the live Strataline map must report
what buried plant is under the pointer and show its attributes in a glass card — today the map answers nothing
except a click on a ticket pin. Second: a real "where am I" button that reads the device fix, flies to it and
draws an accuracy ring. Both matter because the Locator screen is the field tool: a locator standing over a
line needs to know whose it is, and the Dispatch map is the only place a dispatcher can sanity-check an
address against the ground.

## The ask

> 18. On the map, there needs to be the ability to select a feature and pull up the relevant info like on strataline.

> 19. Add actual geolocation functionality to the pinpoint button on the map

## What is true today

### Click-to-inspect: it does not exist, in any form

- There is no click handler on the map object at all. `grep -rn 'queryRenderedFeatures\|Popup\|GeolocateControl\|navigator.geolocation\|NavigationControl\|addControl' addons/strataflow_workorder/static/src addons/strataflow_workorder/static/scss addons/strataflow_workorder/models addons/strataflow_workorder/controllers` returns exactly one line: `static/src/core/strataline_map.js:318`, the `AttributionControl`. Zero `queryRenderedFeatures`, zero `Popup`, zero `map.on("click", …)`.
- The only click path on the map is a per-marker DOM listener: `static/src/core/strataline_map.js:450-453` attaches `click` to the pin button and calls `this.props.onSelect?.(m.id)` with a **ticket id**. It is never a map feature, and it calls `ev.stopPropagation()` at `:451`.
- MapLibre `Marker` elements are appended to the map's canvas container, which is where MapLibre's own `click` handler lives, so that `stopPropagation()` at `:451` already prevents a pin click from ever reaching a future map-level click handler. That is the behaviour we want and must be preserved.
- The map binds `mousedown`/`mousemove`/`mouseup`/`mouseout` and their touch twins in `bindDraw` (`static/src/core/strataline_map.js:597-611`) for the locate-drawing gesture. `click` is not among them.
- Style layers currently on the map: our basemap/labels (`basemapLayers`, `strataline_map.js:69-96`), the ATS grid (`atsLayers`, `:107-118`), address labels (`addrLayer`, `:120-126`), strataline's utility layers copied verbatim out of its `style.json` (`buildStyle`, `:182-200`), plus our own overlays `sf_routes` (`:521-526`) and the five `sf_locate_*` layers (`:568-594`). Ticket pins are DOM `Marker`s (`:454`), **not** style layers, so `queryRenderedFeatures` will never return them.
- Merged-layer identity: strataline packs many datasets into one style layer and tells them apart with the `sub_layer` feature property. This repo already knows that — `applyVisibility` composes `["!", ["in", ["get","sub_layer"], …]]` at `static/src/core/strataline_map.js:384`, and `hiddenState()` walks `row.parts[].sub` at `static/src/core/layers.js:149-165`.
- **But there is no sub_layer → row lookup.** `rowsFromManifest` (`static/src/core/layers.js:64-83`) builds rows keyed by dataset id and stores `parts: [{sub, merged}]` (`:70-75`), and `registerRows` (`:90-94`) indexes rows by `r.id` only. A feature's `properties.sub_layer` cannot be turned into a human dataset name with anything exported today. That index has to be added.
- `layers.js:67` skips any manifest entry with `m.mergedInto` — those datasets never become a row. They are reached only as `members` of their primary row, folded into `parts` at `:71-75`. So an index built from `parts` covers them; an index built from `store.rows` keys alone does not.
- `EXCLUDED_SUBS` (`static/src/core/layers.js:26-29`) are customer-site points and capital-project buffers that are never drawn (`applyVisibility` filters them out of every merged layer, `strataline_map.js:384`), so they cannot come back from a rendered-feature query either.
- Group names available for filtering come straight from the manifest and from `ownRow(...)` calls: `"Basemap"` for our ground layers and `"Reference"` for the ATS grid and house numbers (`strataline_map.js:130-141`), plus strataline's `Gas`/`Electric`/`Telecom`/`Water`/`Sanitary`/`Storm`/`Notes`/`Other` (`layers.js:13`).
- There is nowhere for an attribute card to go without a decision: the layer panel already claims the right side. `.o_sf_layers` is `top: 80px; right: 76px; bottom: 58px; width: 340px` (`static/src/strataflow.scss:255`), and on Dispatch it stops short of the ticket card via the `--above-card` modifier at `:258`, driven by `aboveCard` (`static/src/core/layer_panel.js:12`, passed at `static/src/screens/dispatch.xml:48`). The rail sits at `right: 16px` (`strataflow.scss:287`), Dispatch's queue owns the whole left column (`.o_sf_queue`, `strataflow.scss:283`), and the Dispatch ticket card is bottom-right (`.o_sf_card`, `:289`).
- Drawing mode is a live conflict. `setTool` (`strataline_map.js:613-630`) disables `dragPan` and sets a crosshair cursor when a utility tool is active, and `drawDown` (`:632-649`) starts a segment on mousedown. MapLibre still fires `click` after a mouseup, so a click-to-inspect handler will fire in the middle of drawing unless it is guarded on `this.tool`.
- Reference implementation to learn from (read only, never copied): `/Users/stefan/map-sys/web/app.js` binds `map.on("click", onMapClick)` at `:2112`; `onMapClick` at `:1317-1342` builds a 5 px box around `e.point`, calls `queryRenderedFeatures`, resolves `sub_layer` through `rowOfSub`/`layerInfo` (`:1325-1327`), drops `group === "Basemap"` (`:1328`), dedupes on row id + stringified properties and caps at 25 (`:1332-1338`). Attribute shaping is `codeTwins` (`:1355-1375`) and `displayFields` (`:1380-1395`). The renderer `renderIdentify` (`:1397-1440`) is a fixed DOM card (`/Users/stefan/map-sys/web/index.html:157-170`), **not** a MapLibre `Popup`, and shows the first 8 fields. The highlight writes the picked geometry into a `sel` GeoJSON source (`app.js:1439`, registered in `addOverlays` at `:1060-1081`). Zoom-to is `geomBounds` (`:1445-1450`) + `flyTo`/`fitBounds` (`:1454-1460`).

### GPS: Stefan's premise is wrong — there is no pinpoint button

**There is no GPS button anywhere in this module. The button he means does not do what he thinks it does.**

- The crosshair-looking button on the Dispatch rail is `static/src/screens/dispatch.xml:45`. Its `title` is `"Crew positions"` and its only action is `state.showCrew = !state.showCrew` (declared `static/src/screens/dispatch.js:38`).
- `state.showCrew` has exactly one consumer, `static/src/screens/dispatch.js:91`: it decides whether an `onsite` ticket's pin carries the locator's initials badge. It never moves the map, never reads a position, and has nothing to do with the device.
- The confusion is understandable: that button's SVG is glyph-for-glyph the same crosshair as the real GPS button in strataline (`/Users/stefan/map-sys/web/index.html:148-150`). Same artwork, unrelated function.
- The Locator map rail (`static/src/screens/locator.xml:25-29`) has only Zoom in, Zoom out and Map layers — no crosshair at all. The Dispatch rail (`dispatch.xml:42-47`) has Zoom in, Zoom out, Crew positions, Map layers.
- `navigator.geolocation`, `GeolocateControl` and `NavigationControl` appear zero times in the module (grep above). The only MapLibre control added is `AttributionControl` (`strataline_map.js:318`).
- The "GPS" row in the locator review panel (`static/src/screens/locator.xml:160`) is not a device fix either: it prints the **ticket's stored** `latitude`/`longitude` with the caption `· ticket address`, or `— no fix` when the ticket has no coordinates.
- The rail action pattern that a GPS button must follow: the map hands `{ zoomIn, zoomOut }` to `props.onReady` at `strataline_map.js:343`; the screens stash it as `this.mapApi` (`dispatch.js:212-214`, `locator.js:198-200`) and the rail buttons call through it, with an `_t("The map is not connected to Strataline yet.")` notification when it is null (`dispatch.js:215-221`, `locator.js:201-207`).
- Reference implementation (read only): strataline hand-rolls geolocation at `/Users/stefan/map-sys/web/app.js:1536-1557` — one-shot `navigator.geolocation.getCurrentPosition` with `{ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }`, then `flyTo` with `zoom: Math.max(map.getZoom(), 16)` and an accuracy ring recomputed in pixels by `refreshGpsCircle` (`:1522-1531`). It does **not** use `GeolocateControl`.
- Secure context, confirmed: `navigator.geolocation` is gated on a secure context. `http://localhost:8069` **is** a potentially-trustworthy origin under the W3C secure-contexts rule, and Chrome, Firefox and Safari all allow geolocation there — so the dev server as documented in CLAUDE.md works fine. What does **not** work is reaching the same dev server from a phone over the LAN (`http://192.168.x.x:8069`): that origin is not trustworthy and the browser refuses without ever prompting. Same rule applies to `navigator.clipboard` if the inspect card gets a Copy button.

## Decision needed

1. **Does the Dispatch rail get the GPS button too, or Locator only?** Dispatch is a desk screen: a laptop fix is an IP-derived guess that can be kilometres off, which is misleading next to a ticket pin. Options: (a) both rails, (b) Locator map rail only. **Recommendation: both**, because the accuracy readout (`GPS ±N m`) is shown next to the fix, so a bad desk fix announces itself, and a dispatcher on a tablet in a truck is a real case. If Stefan disagrees, dropping it from Dispatch is deleting one `<button>`.
2. **Which groups are inspectable?** map-sys excludes only `group === "Basemap"`. Ours additionally has `group === "Reference"` (ATS townships/sections/quarters/LSDs and house numbers, `strataline_map.js:139-140`). Options: (a) exclude `Basemap` only — an ATS click answers "which quarter section am I in", which is a real locator question; (b) exclude `Basemap` and `Reference`. **Recommendation: (a).**
3. **How aggressive is the attribute drop policy?** strataline drops ~60 patterns of GIS housekeeping. We must not copy that file. Options: (a) minimal — hide `sub_layer`, blank values, and a short privacy regex; (b) minimal plus one compact housekeeping regex covering row ids/GUIDs, edit-audit columns, CAD label placement, and geometry length/area the map already draws. **Recommendation: (b)**, written fresh from what our own tiles actually carry (read the attributes in the browser first), with the same "mirrored policy, not code" comment style `static/src/core/layers.js:23-25` already uses for `EXCLUDED_SUBS`. Grow the list from real data rather than porting a regex blind.
4. **One-shot fix or a continuous watch?** Options: (a) one-shot `getCurrentPosition` per click (strataline's choice, `app.js:1533-1535`); (b) `watchPosition` with a follow mode. **Recommendation: (a)** — a watch costs battery in the field and needs a follow/unfollow state machine nobody asked for.

None of these block the build; the recommendations are safe defaults.

## Plan

### A — inspect

1. **`addons/strataflow_workorder/static/src/core/layers.js`** — add a sub-layer index. In `registerRows` (`:90-94`), alongside the existing `index`, build `subIndex` from every row's `parts[].sub` (falling back to `r.id` for rows with no `parts`). Export `rowForSub(sub)` and `rowForLayer(layerId)`. Do **not** change `rowsFromManifest`: `mergedInto` datasets are already reachable as `members` folded into `parts` at `:71-75`, and adding them as rows would put duplicates in the layer panel. A `sub_layer` with no hit in `subIndex` is not "unknown" — it is excluded or absorbed and must be dropped silently.
2. **`addons/strataflow_workorder/static/src/core/inspect.js`** *(new)* — pure, no OWL, no DOM:
   - `identifyAt(map, point, { pad = 5, max = 25 })` — build the box `[[x-pad, y-pad], [x+pad, y+pad]]`, call `map.queryRenderedFeatures(box)` with **no `layers` option** (naming a layer id that is not in the current style makes MapLibre fire an error on the map), resolve each hit as `rowForSub(f.properties?.sub_layer) ?? rowForLayer(f.layer.id)`, drop hits with no row (this is what silently removes `sf_routes`, the five `sf_locate_*` layers and anything else of ours that has no manifest row), drop `row.group === "Basemap"`, dedupe on `row.id + "|" + JSON.stringify(f.properties)`, cap at `max`. Returns `[{ feature, row }]`.
   - `displayFields(feature, row)` → `[[key, label, value]]` — drop `sub_layer`, drop blank/null, apply the privacy regex and the housekeeping regex (decision 3), humanise the key (underscores and camelCase to words, keep unrecognised acronyms untouched), and leave tile order otherwise. Keep this file short enough to read in one screen.
3. **`addons/strataflow_workorder/static/src/core/map_inspector.js` + `map_inspector.xml`** *(new)* — an OWL component in the shell's glass language, props `{ hits, selIndex, expanded, onPick, onToggleExpand, onZoom, onClose, aboveCard }`. Header eyebrow `IDENTIFY` plus `1 feature here` / `N features here`; one row per hit with the row's colour dot (`row.color`, already `rgb(...)` from `layers.js:77`) and `group — name`; a `.o_sf_kv` field grid showing the first 8 fields with an `Open all N fields` toggle; actions `Zoom` and `✕`. Reuse `.o_sf_panel`, `.o_sf_kv`, `.o_sf_chip`, `.o_sf_x`, `.o_sf_eyebrow` — no new visual vocabulary.
4. **`addons/strataflow_workorder/static/src/core/strataline_map.js`** — own the inspect state here so both rails get it for free:
   - New props: `inspect` (Boolean, default `false`), `inspectAboveCard` (Boolean, optional), `onInspect` (Function, optional — called with the hit count so a screen can close its layer panel).
   - New `this.state` keys `hits: []`, `hitSel: 0`, `hitExpanded: false`, reset together by a private `clearHits()` (which the screens reach through the `onReady` api, step 7).
   - Bind `map.on("click", (e) => this.onMapClick(e))` next to the existing bindings in `bindDraw` (`:597-611`). `onMapClick` returns immediately when `!this.props.inspect` or when `this.tool` is truthy (a click while a utility or note tool is active must draw, never inspect — `setTool` at `:613-630` is the state that says so). Pin clicks never reach it because of the `stopPropagation()` at `:451`.
   - `syncSelection()` — add source `sf_sel` (GeoJSON) plus layers `sf_sel_line` (filter `["!=", ["geometry-type"], "Point"]`) and `sf_sel_point`, painted with `--accent`-equivalent literals in the same style as the `sf_locate_*` block (`:568-594`). Guard on `this.styleReady`, exactly like `syncRoutes` (`:507-509`) and `syncDrawing` (`:557-559`).
   - Call `this.syncSelection()` from the `style.load` handler at `:322-327` — `setStyle({diff:false})` on a theme or basemap change destroys every source we added, and that handler is the only place they get put back.
   - Zoom-to: a private `zoomToHit()` that walks the geometry coordinates into a `this.gl.LngLatBounds` and calls `fitBounds(..., { padding: this.props.padding, maxZoom: 18 })`, or `flyTo({ center, zoom: Math.max(getZoom(), 17) })` for a Point.
5. **`addons/strataflow_workorder/static/src/core/strataline_map.xml`** — render `<MapInspector t-if="props.inspect and state.hits.length" .../>` inside `.o_sf_map`, after the note input and before `<t t-slot="default"/>`.
6. **`addons/strataflow_workorder/static/src/strataflow.scss`** — new `.o_sf_ident` block placed next to `.o_sf_layers` (`:255-258`): `position: absolute; top: 80px; right: 76px; width: 340px; z-index: 16;` with a `--above-card` modifier that copies the layer panel's `bottom: auto; height: 52%; max-height: 460px` trick verbatim. Because the inspect card and the layer panel both want `right: 76px`, they are **mutually exclusive**: opening one closes the other (step 7).
7. **`addons/strataflow_workorder/static/src/screens/dispatch.xml`** (`:16`) and **`dispatch.js`** — pass `inspect="true" inspectAboveCard="!!(sel and state.cardOpen)" onInspect.bind="onInspect"`; `onInspect(n)` sets `this.state.layersOpen = false` when `n`. The other direction has to be wired too, or the acceptance criterion "opening one dismisses the other" is only half met: the map's `onReady` payload (`strataline_map.js:343`) gains `clearInspect: () => …` alongside `locate` (step 9), and the layers rail button at `dispatch.xml:46` toggles through a small `toggleLayers()` on the screen that calls `this.mapApi?.clearInspect()` on the way open.
8. **`addons/strataflow_workorder/static/src/screens/locator.xml`** (`:18`, the map-mode `StratalineMap`) and **`locator.js`** — `inspect="true"` and `onInspect.bind="onInspect"`, plus the same `toggleLayers()` on its layers rail button (`locator.xml:28`). No `inspectAboveCard`: map mode has no bottom-right card, which is why its `LayerPanel` (`locator.xml:30`) passes no `aboveCard` either. Leave the on-site mini map (`locator.xml:81`) and the `LocateCanvas` map (`static/src/screens/workorders.xml:137`, the template for `static/src/core/locate_canvas.js`) on the default `inspect="false"`: the first is a small context card, the second is the drawing surface.

### B — geolocate

9. **`addons/strataflow_workorder/static/src/core/strataline_map.js`** — hand-rolled, **not** `GeolocateControl`. Reasons: MapLibre's control brings its own DOM and `maplibre-gl.css` chrome that is lazy-loaded *after* our stylesheet, so restyling it into the glass rail needs specificity fights we do not need; the rail is our own component and the button belongs next to Zoom in/out; and we want our own one-shot semantics, our own error copy through Odoo's `notification` service, and an accuracy ring in our tokens. Cost is ~30 lines.
   - `locate()` — if `!navigator.geolocation`, report `"Geolocation is not available in this browser."` and stop. Call `getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 })`. On success store `this.state.gps = { lng, lat, acc }`, call `syncGps()`, then `map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16), duration: this.reducedMotion ? 0 : 800 })` (`this.reducedMotion` already exists at `:363-365`). On failure map `err.code`: `1 PERMISSION_DENIED` → `"Location permission is off — allow it in the browser's site settings."`; `2 POSITION_UNAVAILABLE` → `"No location fix available here."`; `3 TIMEOUT` → `"Location timed out — try again with a clear view of the sky."`. Report through a new `onGps: Function` prop so the screen raises the Odoo notification; also mirror the last result into `this.state.gps` so a footer pill can print it.
   - `syncGps()` — GeoJSON source `sf_gps` with layers `sf_gps_acc` (circle, translucent fill + stroke) and `sf_gps_pt` (circle, solid, white stroke). Guarded on `this.styleReady`. Re-added from the `style.load` handler (`:322-327`) alongside `syncSelection`.
   - Ring radius: MapLibre circle radii are pixels, so recompute on zoom — `mpp = 156543.03392 * cos(lat·π/180) / 2**map.getZoom()`, `px = min(400, acc / mpp)`, `setPaintProperty("sf_gps_acc", "circle-radius", px)`. Hook it into the existing `map.on("move", …)` handler at `:610` next to `trackNote()`.
   - Extend the `onReady` payload at `:343` from `{ zoomIn, zoomOut }` to `{ zoomIn, zoomOut, locate: () => this.locate(), clearInspect: () => this.clearHits() }` (`clearInspect` is step 7's half of the mutual exclusion). Additive, so `dispatch.js:212` and `locator.js:198` keep working unchanged.
10. **`addons/strataflow_workorder/static/src/screens/dispatch.xml`** — a **new** rail button between Zoom out (`:44`) and Crew positions (`:45`), `title="My location"`, calling a new `locate()` on the screen. **Do not touch the Crew positions button at `:45` and do not reuse its crosshair SVG** — give the GPS button a distinct glyph (a filled location arrow) so the two are never confused, and leave Crew positions bound to `state.showCrew` exactly as it is.
11. **`addons/strataflow_workorder/static/src/screens/locator.xml`** — the same new button on the map rail (`:25-29`), after Zoom out.
12. **`addons/strataflow_workorder/static/src/screens/dispatch.js`** and **`locator.js`** — `locate()` mirrors the existing `zoom(dir)` shape (`dispatch.js:215-221`, `locator.js:201-207`): if `!this.mapApi`, `notification.add(_t("The map is not connected to Strataline yet."), { type: "info" })`; else `this.mapApi.locate()`. Pass `onGps.bind="onGps"` to the map; `onGps({ ok, message })` raises `notification.add(message, { type: ok ? "success" : "warning" })`.
13. **Footer readout** — add a pill to the footer slot on Dispatch (`dispatch.xml:90-96`) and Locator map mode (`locator.xml:145-147`) showing `GPS ±N m` once a fix exists, using the same `.o_sf_pill o_sf_pill--sm o_sf_mono` classes the coordinates pill at `dispatch.xml:93` already uses. Keep the last fix on screen until the next one replaces it.

No stock Odoo seam is touched by either feature beyond the two services already in use: `useService("orm")` and `useService("notification")` (`dispatch.js:27-29`). No Python, no model, no view XML, no manifest change — `static/src/**/*.{js,xml,scss}` is already globbed into `web.assets_backend` (`__manifest__.py:35-42`), so new files under `static/src/core/` are picked up with no manifest edit.

## Files

| path | what changes |
| --- | --- |
| `addons/strataflow_workorder/static/src/core/layers.js` | build a `sub_layer → row` index in `registerRows`; export `rowForSub()` / `rowForLayer()` |
| `addons/strataflow_workorder/static/src/core/inspect.js` | **new** — `identifyAt()` (box query, row resolution, Basemap drop, dedupe, cap) and `displayFields()` (attribute policy) |
| `addons/strataflow_workorder/static/src/core/map_inspector.js` | **new** — OWL attribute card component |
| `addons/strataflow_workorder/static/src/core/map_inspector.xml` | **new** — its template, glass language |
| `addons/strataflow_workorder/static/src/core/strataline_map.js` | `inspect`/`inspectAboveCard`/`onInspect`/`onGps` props; `click` binding guarded on `this.tool`; `sf_sel` + `sf_gps` sources and layers; `syncSelection()`, `syncGps()`, `zoomToHit()`, `locate()`; both syncs re-run from `style.load`; ring radius on `move`; `locate` and `clearInspect` added to the `onReady` api |
| `addons/strataflow_workorder/static/src/core/strataline_map.xml` | render `<MapInspector/>` inside `.o_sf_map` |
| `addons/strataflow_workorder/static/src/strataflow.scss` | `.o_sf_ident` + `.o_sf_ident--above-card`; small-screen rule next to the existing `@media (max-width: 900px)` block |
| `addons/strataflow_workorder/static/src/screens/dispatch.xml` | inspect props on `<StratalineMap/>`; layers rail button goes through `toggleLayers()`; **new** GPS rail button (Crew positions untouched); GPS footer pill |
| `addons/strataflow_workorder/static/src/screens/dispatch.js` | `onInspect()`, `toggleLayers()`, `locate()`, `onGps()` |
| `addons/strataflow_workorder/static/src/screens/locator.xml` | inspect props on the map-mode `<StratalineMap/>`; layers rail button goes through `toggleLayers()`; **new** GPS rail button; GPS footer pill |
| `addons/strataflow_workorder/static/src/screens/locator.js` | `onInspect()`, `toggleLayers()`, `locate()`, `onGps()` |

## Landmines

- **Sass eats `min()`/`max()` with mixed units.** `.o_sf_ident--above-card` must use the `bottom: auto; height: 52%; max-height: 460px` pair that `.o_sf_layers--above-card` uses (`strataflow.scss:258`), never `min(52%, 460px)`. `"Incompatible units: px and %"` kills the whole bundle and Odoo then serves the *previous* CSS behind a small red banner, so the change looks like a no-op. Grep any new SCSS for `min(` / `max(` with mixed units before running.
- **`map.isStyleLoaded()` is not "ready".** It is false while any tile streams. Guard `syncSelection()` and `syncGps()` on `this.styleReady` (set in the `style.load` handler, `strataline_map.js:322-323`) exactly as `syncRoutes` (`:507-509`) and `syncDrawing` (`:557-559`) do.
- **`setStyle({diff:false})` destroys every source we added.** The theme toggle and the Map/Satellite switch both call it (`strataline_map.js:253-261`). `sf_sel` and `sf_gps` must be re-created from the `style.load` handler at `:322-327` or the highlight and the GPS dot vanish the first time someone flips to Satellite — the exact shape of the bug where drawings saved to the DB but never rendered.
- **`maplibre-gl.css` is lazy-loaded after our stylesheet.** This is the concrete reason not to use `GeolocateControl`: any rule on a MapLibre-classed element needs more than one class of specificity (see the working examples at `strataflow.scss:244-247` and the comment that explains them at `:234-236`). A hand-rolled button in `.o_sf_rail` sidesteps it entirely.
- **`setFilter` replaces a layer's baked filter.** Do not reach for `setFilter` to scope the inspect query. Query every rendered layer and filter the results in JavaScript; the visibility composition at `strataline_map.js:378-387` must not be disturbed.
- **Odoo compiled CSS is not whitespace-minified.** Verify a new SCSS rule landed with a regex against the served bundle, not an exact substring.
- **"Verified server-side" is not verified.** Both halves of this task are pure browser behaviour. An HTTP 200 on the bundle proves nothing; open the tab.
- **Quote grep globs in zsh** — `--include="*.xml"`, or the flag silently vanishes.
- **New: `layers.js:67` drops `mergedInto` datasets.** They never become rows, so a sub → row index built from `store.rows` keys alone misses them. Build it from `parts[].sub` (`layers.js:71-75`), which does include them. Any `sub_layer` still unresolved is excluded or absorbed — drop the hit silently, never render an "unknown layer" row.
- **New: the pin's `stopPropagation()` at `strataline_map.js:451` is load-bearing.** It is what stops a ticket-pin click from also opening the inspect card. Do not "clean it up".
- **New: `setTool` disables `dragPan` but MapLibre still fires `click`.** Without an early return on `this.tool` in the click handler, every drawn segment also pops an attribute card.
- **New: `queryRenderedFeatures` returns tile-clipped geometry.** The highlight and the Zoom-to bounds follow the fragment that is drawn in the current tiles, not the whole asset. That is expected; do not try to "fix" it by refetching.
- **New: `locator.js:198-200` never clears `this.mapApi` on unmount,** and both the full map and the on-site mini map call `onMapReady`, so `mapApi` points at whichever booted last. The GPS button only exists on the map-mode rail (which only renders when that map is mounted), and `locate()` must no-op safely if `this.map` is gone.
- **New: geolocation and clipboard need a secure context.** `http://localhost:8069` is trustworthy and works in Chrome, Firefox and Safari. Reaching the same dev server from a phone over the LAN (`http://192.168.x.x:8069`) is not, and the browser refuses without prompting — for on-device testing use HTTPS, a tunnel, or Chrome's `chrome://flags/#unsafely-treat-insecure-origin-as-secure` with the LAN origin listed.

## Acceptance criteria

- [ ] Clicking a utility line or point on the Dispatch map opens a glass card naming the dataset (`Group — Name`) and listing its attributes; clicking bare ground closes it.
- [ ] A click where several layers overlap lists every distinct hit (capped at 25), one row each, and picking a row swaps the fields shown.
- [ ] Features from merged style layers are named by their dataset, resolved through `sub_layer`, not by the merged style-layer id.
- [ ] Basemap features (land, water, roads, buildings, road/place labels) never produce a hit; neither do our own `sf_routes` or `sf_locate_*` overlays.
- [ ] A layer switched off in the layer panel produces no hit.
- [ ] The picked feature is highlighted on the map, and the highlight survives a theme toggle and a Map ↔ Satellite switch.
- [ ] `Zoom` frames the picked feature; `Open all N fields` reveals the rest and toggles back.
- [ ] With a utility or note tool active in the Locator drawing stage, a click draws — no card ever appears.
- [ ] Clicking a ticket pin still selects the ticket and does not open an attribute card.
- [ ] The inspect card and the layer panel never overlap; opening one dismisses the other.
- [ ] The Dispatch "Crew positions" button still toggles only the locator initials badge on on-site pins; its title, glyph and binding are byte-identical to today.
- [ ] A new, visually distinct "My location" button exists on the Dispatch rail and the Locator map rail.
- [ ] Pressing it with permission granted flies the map to the device fix, drops a dot with an accuracy ring, and shows `GPS ±N m` in the footer.
- [ ] The ring scales correctly as the map zooms.
- [ ] Denying permission shows a specific, actionable message and leaves the map where it was; a timeout says so distinctly; a browser without `navigator.geolocation` says so too. No unhandled rejection or console error in any of the three paths.
- [ ] The GPS dot survives a theme toggle and a Map ↔ Satellite switch.
- [ ] No Python, model, view or manifest change; `git status` shows changes only under `static/src/`.

## Verification

```bash
cd /Users/stefan/strataflow
# 1. mixed-unit min()/max() in new SCSS — must print nothing
grep -nE "(min|max)\([^)]*%[^)]*px|(min|max)\([^)]*px[^)]*%" addons/strataflow_workorder/static/src/strataflow.scss
# 2. the Crew positions button must be untouched
git diff addons/strataflow_workorder/static/src/screens/dispatch.xml | grep -n "Crew positions"
# 3. restart with the module upgraded (JS/XML/SCSS all changed)
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  --dev=xml --http-port=8069 --log-level=warn -u strataflow_workorder
```

Then, with the server up and no SCSS error in the log, in the browser automation tab (login `admin`/`admin`):

1. `http://localhost:8069/odoo/dispatch`. Console must be clean on load.
2. Click on a gas or electric line on the map. A card appears top-right (left of the rail) with an `IDENTIFY` eyebrow, `1 feature here` (or more), the dataset name, and a field list. Read the attribute keys that come back — they are the input for the drop-policy list in `inspect.js`; tighten it and re-check.
3. Click where a gas line crosses a telecom line. Two or more rows; clicking the second row swaps the field grid and moves the highlight.
4. Click bare ground → card closes, highlight clears.
5. Open the layer panel (rail, layers glyph) → the inspect card is gone. Turn Gas off, close the panel, click a gas line → no hit.
6. With a card open, toggle the theme in the shell, then flip Map → Satellite → Map. The highlight must still be drawn after each.
7. Select a ticket in the left queue so the ticket card is up, then click a line: the inspect card must stop above the ticket card, not sit on it.
8. Click a ticket pin: the ticket selects, no inspect card.
9. Press the new "My location" rail button. Accept the browser's permission prompt. The map flies to the fix; a dot with a translucent ring appears; the footer shows `GPS ±N m`. Zoom in and out two steps — the ring must stay the same real-world size (its pixel radius changes).
10. Revoke location for `localhost` in the site settings and press it again: a permission-denied notification, no map movement, clean console.
11. `http://localhost:8069/odoo/locator` → Map. Repeat steps 2 and 9 on that rail.
12. Back to My Route → pick a stop → `Start locate drawing →`. Pick a utility from the toolbar and click-drag: a segment is drawn and **no** inspect card appears. Switch to `Pan` and click a line: still no card (the drawing canvas does not inspect).
13. Resize the window to ≤900 px wide and repeat step 2: the card must stay on-screen and readable.
