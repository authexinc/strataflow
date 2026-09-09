# 13 — Utility chips should be able to isolate a utility, not only draw it

The utility chips above the locate canvas are drawing-tool selectors and nothing else: picking "Gas" only decides
what the next drag draws, it never touches what the map shows. This task adds a Draw / Filter mode toggle beside
the Undo button in `LocateCanvas`, so that in Filter mode the same chips isolate that utility's Strataline layers
on the map instead of arming a pen. It matters because a locator standing on site wants to see gas alone before
marking gas, and today the only way to do that is the layer panel — which is not reachable from either canvas.

## The ask

> 15. In dispatch view, when a locator is on-site, why when that ticket is opened can I click on the gas, electric,
> etc without actually filtering on the ticket preview, why is there an ability to draw in that view when it should
> just filter. Or rather there should be a "draw/filter" toggle next to the "undo" button to toggle between drawing
> that utility and isolating it in the view.

## What is true today

### The premise does not match the code: there are no utility chips in Dispatch, and none on the on-site stage

**Dispatch has no clickable utility chips at all.** `screens/dispatch.xml:16` mounts a bare
`<StratalineMap markers routes basemap focus padding onSelect onReady/>` — no `tool`, no `drawing`, no `onDraw`
props, so nothing on that screen can draw. `grep -rn "LocateCanvas" static/src` returns nine lines and none of
them is `dispatch.xml`: the class and its `static template` at `core/locate_canvas.js:11-12`, the template at
`screens/workorders.xml:124`, the two mount sites `screens/locator.xml:118` and `screens/workorders.xml:95`, and
the imports/registrations at `screens/locator.js:9`, `:28` and `screens/workorders.js:11`, `:40`. `screens/dispatch.js:20`
declares `static components = { StrataflowShell, StratalineMap, LayerPanel }` — `LocateCanvas` is not imported.

The only utilities visible on Dispatch are read-only `<span>`s in the ticket card:
`screens/dispatch.xml:60` renders `selUtilities` as `<span class="o_sf_util">` elements inside a `<dd>`. They
are spans, not buttons; they have no handler and they filter nothing.

**The Locator on-site stage (STAGE 1) also has no chips and no drawing.** `screens/locator.xml:78` opens the
`state.stage === 'map'` branch and `:81` mounts
`<StratalineMap markers="siteMarkers" basemap zoom="16" padding="constructor.SITE_PADDING" onReady/>` — again no
`tool`, no `drawing`, no `onDraw`. Beside it, `locator.xml:86-102` is the glass "Strataline · at this address"
card. Its utility rows at `:88-90` are `<div class="o_sf_site_row">` with a colour dot, the utility name and a
**hardcoded** status pill reading `on ticket` (`:89`); the cadastral row at `:91` is likewise hardcoded to
`layer on`. Neither string is computed from anything — `grep -rn "layer on" static/src` matches only that line
and an unrelated prose comment in `core/locate_geo.js:5`.
These rows are not buttons, have no `t-on-click`, and change nothing.

**This on-site card is almost certainly what Stefan is clicking.** It is the only place where "gas, electric, …"
appear next to a map on a ticket that has been opened, it looks like a legend of toggles, and it is inert.

### Where the chips actually are, and what one does

The chips live in exactly one template, `strataflow_workorder.LocateCanvas`, defined at
`screens/workorders.xml:124-146` (note: the template is declared in `screens/workorders.xml`, not in
`core/`, even though the component class is `core/locate_canvas.js`).

- Toolbar: `workorders.xml:125` — `<div class="o_sf_tools" role="toolbar" aria-label="Drawing tools">`.
- Chips: `workorders.xml:126-131` — `t-foreach="tools"`, each a `<button class="o_sf_chip o_sf_tool">` with
  `t-att-aria-pressed="tool.on"` and the inline handler `t-on-click="() => (this.state.tool = tool.code)"` at
  `:128`. **Setting `state.tool` is the entire effect of a chip click.**
- Spacer, then Undo at `workorders.xml:133` (`t-on-click="undo"`, `t-att-disabled="!segments.length"`) and Clear
  at `:134` (disabled when there are neither segments nor notes). The toggle Stefan asks for goes here.
- Map: `workorders.xml:137` — `<StratalineMap … drawing="props.drawing" tool="drawTool" utils="props.utilities"
  onDraw.bind="onDraw">`, with the basemap switch at `:138-142` and the live hint at `:143`.

Component state is one line: `core/locate_canvas.js:24` — `useState({ tool: "pan", basemap: "streets" })`.
There is no filter state of any kind. `get tools()` at `:39-45` builds Pan, then one chip per
`props.utilities`, then Note. `get drawTool()` at `:47-49` returns `false` for `"pan"`, otherwise the code, and
that value is the `tool` prop.

`core/locate_canvas.js` imports `geoDrawing`/`segMetres` (`:3`) and `StratalineMap` (`:4`). It **never imports
`./layers`**. `grep -rn "useLayers" static/src` shows exactly two call sites — `layer_panel.js:15` and
`strataline_map.js:241` — beside the definition (`layers.js:59`) and the two imports (`layer_panel.js:3`,
`strataline_map.js:6`). So the drawing UI has no access to layer visibility, and the `LayerPanel` is mounted in
only two places — `screens/locator.xml:30` (Locator *Map* mode only, `state.view === 'map'`) and
`screens/dispatch.xml:48`. Neither the on-site stage nor the draw stage has any way to change what is drawn.

**The chips are not even the ticket's utilities.** Both mount sites pass the full list:
`locator.xml:118` and `workorders.xml:95` both pass `utilities="state.data.utilities"`, which is every
`strataflow.utility` record (`models/strataflow_workorder.py:204-207`). The ticket's own subset is
`selUtilities` (`screens/locator.js:109-112`, `screens/workorders.js:116-119`) and it is used for the header
pills (`locator.xml:63`) and the site card (`locator.xml:88`) but **not** for the canvas chips.

### What a drag does, and how the tool disables the map

`StratalineMap` binds the draw gestures unconditionally in `bindDraw` (`core/strataline_map.js:597-611`:
`mousedown`/`mousemove`/`mouseup`/`mouseout` plus the touch twins). `drawDown` (`:632-649`) returns immediately
when `!this.tool` (`:633-635`), so no tool means no drawing. `setTool` (`core/strataline_map.js:613-630`) is the
switch: for a truthy tool it calls `map.dragPan.disable()` (`:620`), `map.doubleClickZoom.disable()` (`:621`) and
sets `cursor = "crosshair"` (`:622`); for a falsy tool it re-enables both, clears the cursor, calls
`drawCancel()` and drops `state.noteDraft` (`:624-628`). It is driven by a `useEffect` on `props.tool`
(`:277-280`). So **feeding `false` as `tool` is a complete, already-tested "no drawing" mode** — nothing new is
needed to make Filter mode drag-safe.

`drawUp` (`:660-672`) commits a segment only if it is at least `MIN_SEGMENT_M` long, via `props.onDraw`.
Undo at `core/locate_canvas.js:77-79` drops only the last **segment** (`segments.slice(0, -1)`) and never a note;
Clear at `:81-83` wipes segments and notes both.

### The layer store, which the isolate must go through

`core/layers.js` is a module-level singleton: `const store = reactive({ rows: [], ...load(), filter: "",
version: 0 })` at `:43`, plus a private `index` at `:44`. Read it in a component with `useLayers()` (`:59-61`).

- Rows come from strataline's manifest via `rowsFromManifest` (`:64-83`); each row carries `id`, `parts`,
  `group`, `color`, `name`, `safety`, `defaultVis`. This client's own basemap/reference layers are added by
  `ownRow` (`:86-88`), called from `core/strataline_map.js:128-141`.
- `GROUP_ORDER` (`layers.js:13`) is `["Gas", "Electric", "Telecom", "Water", "Sanitary", "Storm", "Notes",
  "Other", "Reference", "Basemap"]`. Confirmed against strataline's manifest
  (`/Users/stefan/map-sys/web/layers.json`, read-only): 116 Electric, 82 Telecom, 54 Gas, 38 Water, 32 Basemap,
  12 Storm, 11 Other, 8 Sanitary, 2 Notes.
- `PRESETS` (`layers.js:14-20`) is already `All / Gas / Electric / Telecom / Water`, and `PRESET_GROUPS`
  (`:21`) already maps `Water → ["Water", "Sanitary", "Storm"]`. `PRESET_ALWAYS` (`:22`) is
  `{Notes, Other, Reference, Basemap}` — the groups a preset never hides.
- `SAFETY` (`:31`) is `{atco_gas_hp_pipe, rogers_cable_highrisk}`: never hidden by a group toggle or a preset,
  never persisted off (`setVisible` `:103-110`, `toggleGroup` `:122-132`, `applyPreset` `:139-146`, `persist`
  `:46-57`).
- `layerVisible(id)` (`:96-101`) is the user's override or the row's `defaultVis`.
- `hiddenState()` (`:149-165`) is the **only** thing the map reads: it returns `{ merged, own }` — per merged
  style layer, all its `sub_layer` values and the hidden ones; plus a flat list of this client's own layer ids
  that are off. Every visibility decision funnels through here.
- `persist()` (`:46-57`) writes `vis`/`open`/`preset` to `localStorage["strataflow.layers"]` and bumps
  `store.version`. **Every existing mutator persists.**

`applyPreset` (`layers.js:139-146`) looks like a ready-made isolate — but it is not usable here: it writes
`store.vis[r.id]` for **every** row and calls `persist()`, so a temporary isolate would permanently overwrite
the user's saved layer choices on this device. It also ANDs with `r.defaultVis` (`:142`), so it can never turn on
a row the manifest ships off.

### How visibility reaches MapLibre (the setFilter landmine, already handled here)

`StratalineMap.applyVisibility()` (`core/strataline_map.js:369-399`) runs from a `useEffect` on
`[this.layers.version, this.map]` (`:269-271`) and again from the `style.load` handler (`:326`). It calls
`hiddenState()` at `:374`, then for each merged layer id (and its `__abandoned` twin) sets
`visibility: none` when every sub-layer is hidden, and composes the filter at `:385`:

```js
map.setFilter(id, this.baked?.[id] ? ["all", this.baked[id], clause] : clause);
```

`this.baked` is captured at style assembly (`buildStyle` `:197` `baked[layer.id] = layer.filter`, stashed at
`:355`). Own layers are switched with `setLayoutProperty` at `:392-397`.

**Therefore any isolate that changes what `hiddenState()` returns is automatically composed with the baked
filter and needs no MapLibre code at all.** The guard is also already correct: `applyVisibility` returns early
unless `this.styleReady` (`:371-373`), the flag set in the `style.load` handler at `:323`.

### Stage machine

Stages are `map | draw | review` (`screens/locator.js:14-18`), `state.stage` defaults to `"map"`
(`locator.js:44`), and `selectStop` resets it to `"map"` (`locator.js:194`). Both `LocateCanvas` mounts carry
`t-key="sel.id"` (`locator.xml:118`, `workorders.xml:95`), so changing ticket destroys and rebuilds the
component — its own `useState` resets for free, but a module-level store does not.

## Decision needed

1. **Confirm the surface.** The toggle as specced lands on `LocateCanvas` — the Locator STAGE 2 "Draw" stage
   (`locator.xml:118`) and the Work Orders detail pane (`workorders.xml:95`). Dispatch gets nothing, because
   Dispatch has no chips and no drawing (`dispatch.xml:16`). If Stefan actually meant the Dispatch ticket card's
   utility spans (`dispatch.xml:60`), that is a different, smaller task: make those spans isolate on click.
   **Recommendation: build the `LocateCanvas` toggle as asked, and additionally wire the Locator on-site card
   (item 2), which is the surface he was most likely clicking. Leave Dispatch's card spans alone for now** —
   Dispatch already has a full layer panel one button away on the rail (`dispatch.xml:46`, panel at `:48`).

2. **Should the read-only on-site rows become the filter control?** (Second half of his question.)
   Options: (a) leave them read-only; (b) make each `o_sf_site_row` (`locator.xml:88-90`) a toggle button that
   isolates that utility, replacing the hardcoded `on ticket` pill with a live `isolated` / `on ticket` state,
   plus a "Show all layers" reset row. **Recommendation: (b).** The on-site stage cannot draw at all
   (`locator.xml:81` passes no `tool`), so there is no mode ambiguity there and no toggle is needed — the rows
   are pure filters, which is exactly what Stefan expected them to be. The hardcoded `layer on` text on the
   cadastral row (`locator.xml:91`) should either become live or be dropped; recommend dropping the pill from
   that row, since no cadastral layer row exists in the store (groups are Gas/Electric/Telecom/Water/Sanitary/
   Storm/Notes/Other/Reference/Basemap — `layers.js:13`).

3. **One utility at a time, or several?** Options: (a) radio — picking Electric replaces Gas; (b) multi-select
   union, click again to drop. **Recommendation: (b) multi-select.** Gas + Electric together is the common
   pre-dig check, and (b) contains (a). A separate "All" chip clears the isolate.

4. **Do safety layers stay visible while a utility is isolated?** `SAFETY` (`layers.js:30-31`, high-pressure gas
   and high-risk cable) is exempt from every existing hide path. Options: (a) keep the exemption under isolate;
   (b) isolate hides everything outside the picked groups, safety included. **Recommendation: (a)**, consistent
   with the existing doctrine — and say so in the canvas hint, e.g. `Gas only · safety layers stay on`.

5. **Default mode.** Options: (a) Draw (today's behaviour); (b) Filter. **Recommendation: (a) Draw**, and do
   **not** persist the mode — the canvas exists to produce a locate print.

## Plan

1. **`static/src/core/layers.js` — add a transient isolate on top of the store, without touching `vis`.**
   - Add, next to `PRESET_GROUPS` (`:21`), a code→groups map for `strataflow.utility.code` values
     (`gas`, `power`, `telecom`, `water` — `data/strataflow_utility_data.xml:4-15`):
     `const UTILITY_GROUPS = { gas: ["Gas"], power: ["Electric"], telecom: ["Telecom"], water: ["Water",
     "Sanitary", "Storm"] };` and `export function groupsForUtility(code) { return UTILITY_GROUPS[code] || []; }`.
     Comment it as the same mirrored-policy shape as `EXCLUDED_SUBS` (`layers.js:23-25`).
   - Add `isolate: []` to the `reactive` store literal at `:43` — **after** the `...load()` spread and **not**
     inside `load()` (`:34-41`) or `persist()` (`:46-57`), so it is never read from or written to
     `localStorage`.
   - Add `function bump() { store.version++; }` and use it (not `persist()`) for isolate mutations, so
     `applyVisibility`'s `useEffect` on `this.layers.version` (`strataline_map.js:269-271`) re-runs while the
     saved layer choices are untouched.
   - `export function toggleIsolate(code)`: replace the array (`store.isolate = […]`, never mutate in place),
     then `bump()`. `export function clearIsolate()`: no-op if already empty, else `store.isolate = []; bump();`.
   - `export function utilityHasLayers(code)`: `groupsForUtility(code).some(g => store.rows.some(r => r.group === g))`
     — false for a utility with no Strataline layer, and false before `registerRows` (`:90-94`) has run.
   - In `hiddenState()` (`:149-165`), compute the isolate group set once and replace **both** uses of
     `layerVisible(r.id)` (`:156` and `:160`) with a local helper:
     ```js
     const iso = new Set(store.isolate.flatMap(groupsForUtility));
     const shown = (r) => r.safety || (layerVisible(r.id) && (!iso.size || iso.has(r.group) || PRESET_ALWAYS.has(r.group)));
     ```
     This is the whole isolation mechanism: it narrows what `hiddenState()` reports as visible, so
     `applyVisibility` (`strataline_map.js:369-399`) composes it into `["all", baked, clause]` at `:385` exactly
     as it does for the layer panel. **No change to `strataline_map.js` is required or permitted for this.**
     Clearing the isolate restores the user's saved `vis` because `vis` was never written.

2. **`static/src/core/locate_canvas.js` — mode state, isolate wiring, teardown.**
   - Import `onWillUnmount` from `@odoo/owl` and `{ clearIsolate, toggleIsolate, useLayers, utilityHasLayers }`
     from `./layers`.
   - `setup()` (`:23-25`): `this.state = useState({ tool: "pan", basemap: "streets", mode: "draw" })`;
     `this.layers = useLayers();` `onWillUnmount(() => clearIsolate());`.
   - `get filtering() { return this.state.mode === "filter"; }`.
   - `get drawTool()` (`:47-49`): return `false` when `this.filtering`, else today's logic. This alone kills
     drawing in Filter mode via `setTool(false)` (`strataline_map.js:624-628`), which re-enables `dragPan` and
     `doubleClickZoom` and cancels any live segment — no new guard needed.
   - `get tools()` (`:39-45`): in Draw mode, unchanged. In Filter mode, return only the utility chips —
     `{...u, on: this.layers.isolate.includes(u.code), disabled: !utilityHasLayers(u.code)}` — with no Pan chip
     (Filter mode *is* pan) and no Note chip (Note is a pen).
   - `pickTool(tool)`: new method replacing the inline handler at `workorders.xml:128`. Filter mode →
     `toggleIsolate(tool.code)` (ignore disabled chips); Draw mode → `this.state.tool = tool.code`.
   - `setMode(mode)`: on entering Filter, leave `state.tool` alone so Draw mode restores the same pen; on
     entering Draw, `clearIsolate()` so the map is whole while marking.
   - `get modes()`: `[{key: "draw", label: _t("Draw"), on: !this.filtering}, {key: "filter", label: _t("Filter"), on: this.filtering}]`.
   - `get hint()` (`:63-71`): in Filter mode return the isolate state instead of the draw hints — no isolate →
     `_t("filter mode · tap a utility to show it alone")`; otherwise
     `_t("%s only · safety layers stay on", names.join(", "))`, names resolved from `props.utilities`.

3. **`static/src/screens/workorders.xml` — the toolbar (template `strataflow_workorder.LocateCanvas`,
   `:124-146`).**
   - `:125`: make the toolbar label follow the mode —
     `t-att-aria-label="filtering ? 'Layer filter' : 'Drawing tools'"`.
   - `:126-131`: swap the inline handler for `t-on-click="() => this.pickTool(tool)"` and add
     `t-att-disabled="tool.disabled"` and `t-att-title="tool.disabled ? 'No Strataline layer for this utility' : undefined"`.
     `t-att-aria-pressed="tool.on"` (`:128`) already carries the accessible state for both modes.
   - Between the spacer (`:132`) and Undo (`:133`), insert the mode toggle — a two-button segmented group, so
     it reads as one control and both states are always visible:
     ```xml
     <span class="o_sf_seg" role="group" aria-label="Chip mode">
         <t t-foreach="modes" t-as="m" t-key="m.key">
             <button type="button" class="o_sf_chip" t-att-class="{ 'is-on': m.on }" t-att-aria-pressed="m.on"
                     t-on-click="() => this.setMode(m.key)" t-esc="m.label"/>
         </t>
     </span>
     ```
     Undo (`:133`) and Clear (`:134`) stay where they are and keep working in both modes — they act on the
     drawing, not the map.

4. **`static/src/strataflow.scss` — one rule, beside `.o_sf_tools` (`:175`).**
   `.o_sf_seg { display: inline-flex; align-items: center; gap: 3px; padding: 2px; border-radius: 999px;
   background: var(--chip-bg); }`. `.o_sf_chip` (`:118-119`) already provides the `is-on` ink treatment and
   `:where(button:disabled) { opacity: .45; cursor: default; }` (`strataflow.scss:45`) already dims a disabled
   chip. No `min()`/`max()`, no new tokens.

5. **`static/src/screens/locator.xml` — the on-site card rows become the filter (decision 2).**
   Replace the three-`<span>` rows at `:88-90` with buttons:
   `<button type="button" class="o_sf_site_row o_sf_site_row--btn" t-att-aria-pressed="isolated(u.code)"
   t-att-disabled="!hasLayers(u.code)" t-on-click="() => this.toggleUtility(u.code)">`, colour dot unchanged,
   and the pill at `:89` driven by state (`isolated` / `on ticket`) instead of the hardcoded string. Add a
   "Show all layers" reset button under the rows, rendered only while something is isolated. Drop the hardcoded
   `layer on` pill from the cadastral row (`:91`). Add `.o_sf_site_row--btn { width: 100%; text-align: left; }`
   to `strataflow.scss` beside `.o_sf_site_row` (`:334`).

6. **`static/src/screens/locator.js` — own the reset.** Import `{ clearIsolate, toggleIsolate, useLayers,
   utilityHasLayers }`; add `this.layers = useLayers()` in `setup()` (`:36-59`) and the three small getters/
   methods used in step 5. Clear the isolate wherever the surface changes: in `selectStop` (`:192-196`, which
   already resets `stage` at `:194`), in the three stage buttons that leave STAGE 1/2/3 (`locator.xml:111`,
   `:125`, `:136`), on the `state.view = 'map'` handlers (`locator.xml:9`, `:107`) — full Map mode owns the
   `LayerPanel` (`locator.xml:30`) and its rows read `layerVisible` (`core/layer_panel.js:37`), which does not
   know about the isolate — and in the existing `onWillUnmount` (`locator.js:58`), alongside `flushDrawing()`.
   `LocateCanvas`'s own `onWillUnmount` (step 2) covers the Work Orders screen and stage changes that unmount it.

7. **No server-side change.** `strataflow.utility` already carries `name`/`code`/`color`
   (`models/strataflow_utility.py:10-12`) and `get_board_data` already ships them
   (`models/strataflow_workorder.py:204-207`). No stock Odoo seam is touched by this task — the only Odoo
   surface involved is the OWL template registry, which already renders these templates.

## Files

| path | what changes |
| --- | --- |
| `addons/strataflow_workorder/static/src/core/layers.js` | `UTILITY_GROUPS` + `groupsForUtility`; transient `isolate` in the store (never persisted); `bump`, `toggleIsolate`, `clearIsolate`, `utilityHasLayers`; `hiddenState()` narrows through the isolate |
| `addons/strataflow_workorder/static/src/core/locate_canvas.js` | `mode` state, `useLayers`, `pickTool`, `setMode`, `modes`, filter-aware `tools`/`drawTool`/`hint`, `onWillUnmount(clearIsolate)` |
| `addons/strataflow_workorder/static/src/screens/workorders.xml` | `LocateCanvas` template (`:124-146`): chip handler → `pickTool`, disabled state, mode segmented control before Undo, mode-aware toolbar label |
| `addons/strataflow_workorder/static/src/screens/locator.xml` | on-site card rows (`:88-91`) become isolate buttons with live state + a reset row |
| `addons/strataflow_workorder/static/src/screens/locator.js` | isolate getters/handlers; `clearIsolate` on stop change, stage change, view change and unmount |
| `addons/strataflow_workorder/static/src/strataflow.scss` | `.o_sf_seg` (beside `.o_sf_tools`, `:175`) and `.o_sf_site_row--btn` (beside `:334`) |

No new files. Nothing outside `addons/strataflow_workorder/` is touched.

## Landmines

- **`setFilter` replaces a layer's baked filter.** Strataline's merged layers ship a filter, captured at
  `strataline_map.js:197` and restated as `["all", baked, clause]` at `:385`. This task must isolate **only** by
  changing what `hiddenState()` (`layers.js:149-165`) reports; never call `map.setFilter`, `setLayoutProperty` or
  `setPaintProperty` from the canvas or the store. If you find yourself editing `strataline_map.js`, stop.
- **Never write `store.vis` for the isolate.** `applyPreset` (`layers.js:139-146`) and `setVisible` (`:103-110`)
  both `persist()` to `localStorage["strataflow.layers"]`. Reusing them would permanently overwrite the user's
  saved layer choices with a temporary field filter and there would be no way back. The isolate is a separate,
  unpersisted field, and clearing it restores the saved state by construction.
- **The store is a module singleton, shared with Dispatch and the Locator map mode.** `layers.js:43` is created
  once per bundle and `useLayers()` (`:59-61`) hands the same object to every mounted map and to the
  `LayerPanel` (`layer_panel.js:15`). An isolate left set would silently hide layers on Dispatch. Clear it on
  every exit path (step 6); `LayerPanel` rows read `layerVisible` (`layer_panel.js:37`) and will **not** show
  the isolate, which is exactly why the two must never be live at the same time.
- **`map.isStyleLoaded()` is not "ready".** `applyVisibility` guards on `this.styleReady` (`strataline_map.js:371`),
  set only in the `style.load` handler (`:323`). Do not add an isolate code path that bypasses that guard, and do
  not "fix" a non-updating map by polling `isStyleLoaded()`; if a change does not land, check that
  `store.version` was bumped.
- **Sass eats CSS `min()`/`max()` with mixed units.** `min(52%, 460px)` once threw *Incompatible units: px and %*
  and killed the whole bundle, after which Odoo served the previous CSS behind a small red banner — it looks
  like the change did nothing. The new rules in step 4 use no `min()`/`max()`; keep it that way, and grep any
  SCSS you add for `min(`/`max(`.
- **maplibre-gl.css loads after ours**, so a rule on a MapLibre-classed element needs more than one class of
  specificity. Nothing in this task styles a MapLibre element — keep it that way; the toggle is plain toolbar
  chrome outside the canvas.
- **A drawing without `v: 2` reads as empty**, and `controllers/export.py` mirrors `projectDrawing` in Python.
  This task must not touch the drawing payload at all: Filter mode is read-only with respect to `props.drawing`,
  and Undo (`locate_canvas.js:77-79`) / Clear (`:81-83`) keep their current semantics — Undo still drops only the
  last segment, never a note.
- **Quote grep globs in zsh** — `--include=*.xml` unquoted expands and the flag silently vanishes.
- **Odoo's compiled CSS is not whitespace-minified**, so verify a new rule with a regex, not an exact substring.
- **"Verified server-side" is not verified.** Layer isolation is only observable by looking at the map. The
  browser tab is the verification, not an HTTP 200.
- **New, found while reading:** the chips are fed `state.data.utilities` (all four utilities) at
  `locator.xml:118` and `workorders.xml:95`, not the ticket's `selUtilities`. In Filter mode that is arguably
  correct (a locator may want to see a utility the ticket does not list), but it means the Filter chips and the
  ticket's utility pills (`locator.xml:63`) will not match. Do not silently switch the prop to `selUtilities` —
  that would also remove drawing tools the locator currently has.
- **New, found while reading:** `utilityHasLayers` returns false before `registerRows` (`layers.js:90-94`) has
  run, which happens in `boot()` (`strataline_map.js:296`) at `:310`, after the manifest loads. Chips must therefore
  re-evaluate their disabled state reactively (`this.layers.version` / `this.layers.rows` read inside the getter)
  or they will be stuck disabled from the first render.

## Acceptance criteria

- [ ] A Draw / Filter segmented toggle sits between the spacer and Undo in the `LocateCanvas` toolbar, on both
      mount sites (Locator STAGE 2 and the Work Orders detail pane). Each button carries `aria-pressed`, and the
      toolbar's `aria-label` reflects the mode.
- [ ] Draw mode is the default and behaves exactly as today: chips arm a pen, drag draws, Pan and Note chips
      present.
- [ ] In Filter mode, clicking a utility chip isolates that utility's Strataline groups on the map
      (`gas→Gas`, `power→Electric`, `telecom→Telecom`, `water→Water+Sanitary+Storm`). Clicking it again drops it;
      several may be isolated at once; with none isolated the map shows the user's normal layers.
- [ ] In Filter mode no drag can draw and no click can place a note: the map pans and double-click zooms
      normally, no segment is appended, and the drawing on the ticket is byte-identical before and after.
- [ ] Basemap, Reference (ATS grid, house numbers), Notes and Other groups stay visible while a utility is
      isolated, and the two `SAFETY` layers stay visible.
- [ ] Switching back to Draw, changing ticket, changing stage, going to Locator Map mode, or leaving the screen
      clears the isolate; the layer panel on Dispatch and on Locator Map mode shows exactly the layer choices the
      user had before, including any layer they had switched off by hand.
- [ ] `localStorage["strataflow.layers"]` has no `isolate` key and its `vis` object is unchanged by any amount
      of isolating.
- [ ] A utility whose code has no Strataline group is rendered as a disabled chip in Filter mode with an
      explanatory `title`, and still works normally as a pen in Draw mode.
- [ ] The canvas hint reports the filter state in Filter mode and the line/note/metre tally in Draw mode.
- [ ] (Decision 2 accepted) The Locator on-site utility rows are buttons that isolate, their status pill is
      computed rather than hardcoded, and a reset control appears while something is isolated.

## Verification

```bash
cd /Users/stefan/strataflow
# 1. bundle must compile — a Sass error serves the PREVIOUS css behind a small red banner
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  --dev=xml --http-port=8069 --log-level=warn -u strataflow_workorder
# watch the startup log for "Incompatible units" / "compiling" errors; there must be none

# 2. the new rules are really in the served CSS (Odoo does not minify whitespace — use regexes)
curl -s 'http://localhost:8069/web/assets/any/web.assets_backend.css' | grep -cE '\.o_sf_seg\s*\{'

# 3. nothing outside the module changed
git status --short
git diff --stat            # only addons/strataflow_workorder/static/src/** and .../strataflow.scss
```

In the browser tab (login `admin`/`admin`; never type the password by hand — reuse the session cookie):

1. **`/odoo/locator`** → pick an open stop → the on-site stage. If decision 2 was taken: click **Gas** in the
   "Strataline · at this address" card. Everything but gas (plus basemap, ATS grid, house numbers and the two
   safety layers) must disappear from the map. Click it again — everything returns.
2. **"Start locate drawing →"** (`locator.xml:111`) → STAGE 2. Confirm the toggle sits immediately left of
   **Undo**, that **Draw** is preselected, and that dragging still draws a line and Undo removes it.
3. Switch to **Filter**. The Pan and Note chips disappear; the utility chips remain. Click **Gas**: only gas
   layers stay. Now **press and drag hard across the map** — the map must pan, no line may appear, and the hint
   must not change to a line count. Double-click: the map zooms. Click **Electric** as well: both are shown.
4. Switch back to **Draw**: all layers return, and the pen you had selected before is still selected.
5. **Back to site → My Route → Map** (`locator.xml:8-9`) → open the layer panel from the rail
   (`locator.xml:28`). Every row must show the state it had before you started; in particular a layer you turned
   off by hand beforehand is still off.
6. **`/odoo/dispatch`** → open the layer panel (`dispatch.xml:46`). Same check: untouched.
7. In the console: `JSON.parse(localStorage["strataflow.layers"])` — keys are `vis`, `open`, `preset` only;
   no `isolate`.
8. **`/odoo/workorders`** → select a ticket with a drawing → the detail pane's Locate drawing canvas
   (`workorders.xml:95`): the toggle is present and behaves identically, and switching tickets while a filter is
   active leaves the next ticket's map unfiltered.
9. Repeat step 3 in **dark theme** and on **Satellite** (`workorders.xml:138-142`) — the `is-on` chip state must
   stay legible in both, and the isolate must survive a basemap switch (`setStyle` → `style.load` →
   `applyVisibility`, `strataline_map.js:253-261`, `:322-327`).
