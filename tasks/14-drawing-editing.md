# 14 — Make the locate drawing editable: labels, curves, moves, measurements, north

Today the locate drawing is append-only: a segment is exactly two points, it has no identity, and once
drawn the only mutations are "delete the last one" and "delete everything". A future session must turn it
into an editable annotation layer — lines with many vertices that can be curved or squared, features that
can be selected, moved and re-shaped, notes that can be re-opened and re-typed, per-line size/material
labels, a repositionable measurement, and a compass that keeps drawing north-aligned. This is the single
largest item in the backlog, it does not fit one session, and it is split into six ordered sub-tasks below.
**14a — the v:3 format — is the foundation and must land first**, because every other sub-task edits the
same five rendering sites and doing any of them against the two-point format guarantees a rewrite.

## The ask

> 20. For the drawing: 1. North alignment (the compass toggle thing when drawing, also on ticket completion, the ticket is automatically north-aligned) 2. Editable measurement arrows 3. Edit what lines say ex: right click on plotted gas line and be able to write over it what size and material it is 4. Ability to edit, curve or square lines 5. Make things like the lines and notes editable/movable

## What is true today

### The data model is the whole problem

- The stored shape is documented at `static/src/core/locate_geo.js:8` and built at `:19-21`:
  `{ v: 2, segments: [{ a: [lng, lat], b: [lng, lat], util }], notes: [{ at: [lng, lat], text }] }`.
- It is persisted verbatim into a `fields.Json` column: `models/strataflow_workorder.py:48`
  (`drawing = fields.Json(default=dict)`), documented in the comment at `:46-47`.
- `isGeoDrawing` is literally `d?.v === 2` (`static/src/core/locate_geo.js:23-25`); `geoDrawing` coerces
  anything else — including the old `v: 1` canvas-pixel format — to an empty drawing (`:28-30`). So a
  drawing that fails the version check is silently blank, everywhere, with no warning.
- **Segments are strictly two-point.** There is no vertex array. A segment is created as
  `{ a: at, b: at, util }` at `static/src/core/strataline_map.js:647` and appended whole at `:668`.
  A curved or multi-vertex line is *impossible* without changing the format.
- **Fields that do not exist today**: no `id`, no `label`, no `size`/`diameter`, no `material`, no `depth`,
  no per-feature `style`/`width`/`dash`, no `created_at`, no author, no z-order, no label offset.
  Segments carry exactly three keys and notes exactly two. Confirmed against all three consumers:
  `static/src/core/locate_geo.js:73-78`, `static/src/core/strataline_map.js:541-552`,
  `controllers/export.py:51-52`.
- `segMetres` (`static/src/core/locate_geo.js:32-34`) reads `s.a` and `s.b` directly and calls
  `haversineKm` from `static/src/core/geo.js:28-38`. Every metre figure in the product comes from it.

### Nothing is editable

- The only mutations in the codebase are: append a segment (`static/src/core/strataline_map.js:668`),
  append a note (`:698`), pop the last segment (`static/src/core/locate_canvas.js:78`), and clear
  everything (`:82`). That is the complete set.
- There is no hit-testing of any kind. `queryRenderedFeatures` appears nowhere in the module; the only
  MapLibre control added is `AttributionControl` at `static/src/core/strataline_map.js:318`.
- There is no per-feature id, so nothing can be addressed. `drawingData()`
  (`static/src/core/strataline_map.js:539-554`) builds GeoJSON features whose `properties` are
  `{ color, dashed, live, label }` for lines (`:543`) and `{ text }` for notes (`:551`) — no identity
  survives into the rendered layer.
- Notes cannot be re-edited. `commitNote` (`:689-700`) only ever pushes a new note; `onNoteKeydown`
  (`:702-709`) offers Enter to commit and Escape to discard. There is no path back into an existing note.
- Persistence is a debounced 600 ms whole-object write: `onDrawingChange`
  (`static/src/screens/locator.js:223-233`) mutates the in-memory ticket, then `flushDrawing`
  (`:235-242`) does `orm.write("strataflow.workorder", [id], { drawing })` at `:240`. The same pair exists
  on the dispatcher's screen at `static/src/screens/workorders.js:242-260`. There is no partial update.
- `LocateCanvas` is mounted on **both** screens: `static/src/screens/locator.xml:118` and
  `static/src/screens/workorders.xml:95`. Any toolbar change lands in both places at once.

### Five places derive the label and the gas dash, and all five must stay in step

1. **Live map.** `properties.label` is built at `static/src/core/strataline_map.js:543` as
   `` `${this.utilLetter(s.util)} ${segMetres(s).toFixed(1)} m` `` and `dashed: s.util === "gas"` on the
   same line. Drawn by layer `sf_locate_label` (`:581-585`): `text-field: ["get","label"]`,
   `symbol-placement: "line-center"`, `text-size: 11`, `text-offset: [0,-1.1]`,
   `text-allow-overlap: true`, `text-ignore-placement: true`. Lines are `sf_locate_line` (`:569-573`) and
   `sf_locate_line_gas` (`:575-579`, `line-dasharray: [0.1, 2.2]`) — two layers because
   `line-dasharray` cannot vary per feature. Notes are `sf_locate_note_dot` (`:586-589`) and
   `sf_locate_note` (`:590-594`). All five layers sit on one GeoJSON source `sf_locate` (`:568`),
   rebuilt wholesale by `syncDrawing` (`:556-595`), which returns early unless `this.styleReady`
   (`:557-560`).
2. **SVG preview.** `LocatePreview.label()` at `static/src/core/locate_preview.js:31-34`, rendered by the
   template at `static/src/core/shell.xml:159-172` — the line at `:164` (with the hardcoded
   `s.util === 'gas' ? '1 8'` dash), the label `<text>` at `:165`, notes at `:168`, the `N ↑ · scale`
   caption at `:162`.
3. **PNG export.** A third, independent string-built SVG in
   `static/src/screens/workorders.js:273-298` — the segment line and its label at `:284-285`
   (again `s.util === "gas"` hardcoded), notes at `:288`.
4. **PDF export.** `controllers/export.py:117-128` — dash at `:121`, `drawCentredString` label at `:128`,
   notes at `:129-134`.
5. **Audit / totals.** `auditDrawing` (`static/src/core/audit.js:8-44`) walks `segs` and calls `segMetres`
   per segment at `:26`, with per-segment thresholds at `:27` (< 2 m) and `:30` (> 90 m) and per-segment
   numbering `n: i + 1`. `linesByUtility` (`:46-55`) groups by `s.util` and sums `segMetres`.

### The exports

- **CSV** (`static/src/screens/workorders.js:300-314`) emits one row per two-point segment with the header
  `segment,utility,from_longitude,from_latitude,to_longitude,to_latitude,metres` at `:307`.
  **Pre-existing bug**: the notes header at `:310` declares four columns
  (`note,longitude,latitude,text`) but the rows pushed at `:311` supply only three — the note index column
  is missing from every row, so the note text lands under `latitude`. Fix it while the block is rewritten.
- **PNG** (`:273-298`) calls `projectDrawing` from `locate_geo.js`, so it inherits any format change for
  free in geometry, but its own label/dash strings are hand-built and do not.
- **PDF** (`controllers/export.py:58-161`) calls `project_drawing` at `:112`.
- `static/src/core/download.js` is generic plumbing (`downloadBlob`, `downloadText`, `svgToPng`) and needs
  **no change**: it never looks at the drawing.

### The projection is unconditionally north-up — the "north-aligned on completion" ask is already true

- `projectDrawing` (`static/src/core/locate_geo.js:51-80`) takes no bearing parameter. `points()` flattens
  every `a`, `b` and `at` (`:36-45`); the centre is the midpoint of the **drawing's own** bounding box, not
  the ticket's coordinates (`:59-60`); metres are equirectangular with
  `mPerDegLng = 111320 * cos(lat0)` (`:61`); `toM` flips y at `:62`, and that minus sign is the **only**
  north-up mechanism in the codebase. There is no rotation matrix anywhere.
- Scale: `MIN_SPAN_M = 30` (`:16`), `MAX_PX_PER_M = 12` (`:17`), applied at `:64-66`.
- `controllers/export.py:25-53` mirrors all of it in Python, with the standing warning at `:12-13`
  ("keep the two in step") and `MAX_PT_PER_M = 8 * 72 / 96` at `:16`.
- So Stefan's "on ticket completion, the ticket is automatically north-aligned" **already holds** — the
  print and the PDF have never been anything but north-up. What is missing is that this is only *asserted*
  in text, at `static/src/core/shell.xml:162` (`N ↑ · …`), `static/src/screens/locator.xml:183`
  (`· locate print · north up`) and `controllers/export.py:152` (`'north up · 10 mm ≈ …'`). Nothing on the
  live drawing surface tells the locator which way north is, and nothing stops the map from rotating.

### Map rotation is enabled, and that is a latent bug

- The map is constructed with only `container`, `style`, `center`, `zoom`, `attributionControl: false`
  (`static/src/core/strataline_map.js:311-317`). No `dragRotate: false`, no `touchZoomRotate: false`, no
  `bearing`, no `pitchWithRotate: false`.
- `setTool` (`:613-630`) disables **only** `dragPan` and `doubleClickZoom` while a draw tool is active. So
  right-drag rotate, two-finger rotate and shift+arrow keyboard rotate all stay live **mid-draw**.
- A rotated map does **not** corrupt the data — segments store true `lng`/`lat`, so the geometry is always
  correct. The bug is perceptual: the locator draws on a map turned 40°, then the preview, the PNG and the
  PDF silently re-orient the same drawing to north with no warning and no way to put the map back.
- `grep -rn "NavigationControl\|dragRotate\|touchZoomRotate\|bearing\|resetNorth\|compass"` over
  `static/src`, `static/scss`, `models` and `controllers` returns **zero** lines. There is no compass, no
  north indicator, no reset action.
- The vendored MapLibre is **5.24.0** (`static/lib/maplibre-gl/README`) and does have everything needed:
  `map.dragRotate.disable()`, `map.touchZoomRotate.disableRotation()`, `map.keyboard.disableRotation()`,
  `map.resetNorth()`, `map.setBearing()`, `map.getBearing()`, `map.queryRenderedFeatures()`,
  `NavigationControl`, GeoJSON `promoteId`, and the `["format", …, {"font-scale": …}]` text expression —
  all confirmed present in `static/lib/maplibre-gl/maplibre-gl.js`.

### Draw gesture, as it stands

- `bindDraw` (`static/src/core/strataline_map.js:597-611`) binds `mousedown`/`mousemove`/`mouseup`/
  `mouseout` and the four touch twins, plus `move → trackNote()`. `click` and `contextmenu` are **not**
  bound (MapLibre 5.24 does fire `contextmenu`; confirmed in the bundle).
- `drawDown` (`:632-649`) ignores non-primary buttons at `:636-639`, so right-click already falls through
  harmlessly today.
- `drawUp` (`:660-672`) discards anything shorter than `MIN_SEGMENT_M = 0.5` (`:20`).
- The note input is plain DOM positioned over the map by `trackNote()` (`:682-687`) writing
  `state.notePx`, consumed by `static/src/core/strataline_map.xml` (the `t-if="state.noteDraft"` input),
  styled at `static/src/strataflow.scss:188`. **This is the pattern to reuse for any pointer-anchored UI.**

### The completion guard reads `segments` by name

`models/strataflow_workorder.py:132` refuses `action_complete_locate` when
`not (self.drawing or {}).get('segments')`. Renaming the key in v:3 makes this guard fail *closed*
("Draw the locate before submitting the ticket"), which is the safe direction, but it must be updated.

### map-sys has nothing to copy

Strataline's only drawing tool is a click-to-add measure polyline: `setMeasuring`
(`/Users/stefan/map-sys/web/app.js:1481-1487`), `addMeasurePoint` (`:1489-1504`), `clearMeasure`
(`:1506-1511`). Zero drag, zero vertex editing, no draw library, no attribute editor. The one
transferable *idea* is that its measure line accepts N points where a Strataflow segment is capped at two.
Read only; copy nothing.

## Decision needed

1. **What does "editable measurement arrows" mean?** Three readings, and they are not the same product:
   (a) the computed haversine distance stays authoritative and only the *label* becomes repositionable
   (drag it along the line, nudge it off the line);
   (b) the locator can **type over** the distance, overriding the geometry;
   (c) the measurement becomes a proper dimension line with end ticks/arrowheads drawn at both ends.
   **Recommendation: (a), plus (c) as a cheap add-on** (end ticks are two short perpendicular line
   features computed in JS and mirrored in Python — they cost nothing in any of the five renderers).
   **Recommend rejecting (b).** A locate print is a field record that a dispatcher reviews and a
   contractor digs against; a hand-typed length that disagrees with the plotted geometry is a fabricated
   measurement on a liability document. If Stefan wants (b) anyway, it must be stored as a separate
   `metresOverride` field, rendered with a visible marker (e.g. `≈ 12.0 m`), and logged to the ticket's
   `mail.thread` so the override is auditable — say so and it goes in 14f.
2. **Is v:2 upgraded in the database, or read-compatibly?** (a) JS-only shim in `geoDrawing()` that
   upgrades v:2 → v:3 in memory on every read, DB rewritten only on the next save; (b) an Odoo migration
   script that rewrites every stored drawing once; (c) both. **Recommendation: (c).** The shim is what
   makes correctness unconditional (a restored dump, a record nobody re-saves, a stale browser tab all
   still work), and the migration is what keeps Python from needing its own shim forever. Note the shim
   must generate **deterministic** ids for upgraded features (`"s0"`, `"s1"`, `"n0"`…) — random ids
   regenerated on every read would break selection and undo. `v: 1` stays treated as empty, exactly as
   today (`locate_geo.js:28-30`), and `BACKLOG.md:87-89` already sanctions clearing those rows.
3. **Curve representation.** (a) bezier control points; (b) densified polyline — the curve tool generates
   intermediate vertices at draw time and stores plain `[lng, lat]`; (c) a flag plus intermediates
   generated at render time. **Recommendation: (b), densify at edit time.** With (b) every consumer — the
   MapLibre `LineString`, the SVG `polyline`, reportlab's `pdf.lines`, the CSV, the haversine sum — works
   with zero curve math anywhere, and `controllers/export.py` needs **no** bezier evaluator. (a) forces
   bezier sampling into Python *and* turns arc length into a numeric integral, which is the measurement
   the whole print exists for. (c) duplicates the same curve math in four places, which is exactly the
   "keep the two in step" trap `export.py:12-13` already warns about. Cap densification at 24 points per
   curved span and store an advisory `shape: "curve"` hint the editor uses to re-derive its handles —
   renderers ignore it.
4. **Does the map keep the ability to rotate?** (a) disable rotation on every Strataflow map outright
   (cheapest, one line in the constructor, kills the latent bug dead); (b) keep rotation, add a compass
   button that shows the bearing and resets to north on click, and **force `bearing` back to 0 whenever a
   draw or edit tool is activated**. **Recommendation: (b).** Rotating to line up with a fence or a lane
   is genuinely useful while *looking*, and Stefan explicitly asked for "the compass toggle thing when
   drawing"; a compass that can never move is theatre. Snapping to north on tool activation means drawing
   always happens in the same frame the print uses, which is the actual defect. (a) is the fallback if
   this proves fiddly.
5. **Which attributes does the line editor capture?** Size and material are named in the ask. Depth,
   owner/utility company, and a free-text remark are the obvious neighbours. **Recommendation: size,
   material and a free-text remark in 14e; leave depth out** until Stefan says locators record it, because
   a depth field on a locate print invites people to read it as a guaranteed depth, which it is not.

## Plan

Six sub-tasks. **Do 14a first** — it changes the shape every other sub-task reads and writes, it is the
only one that touches all five renderers plus Python at once, and it can be shipped with **no visible UI
change**, which makes it verifiable in isolation (draw with today's tools, confirm preview/PNG/PDF/CSV are
byte-for-byte equivalent). 14b is independent of everything and can be done by a parallel session.

Dependency order: `14a → 14c → {14d, 14e, 14f}`; `14b` standalone.

### 14a — the v:3 format and the upgrade path (do this first)

1. `static/src/core/locate_geo.js` — define v:3 and rewrite the module header comment at `:3-13`:

   ```js
   {
     v: 3,
     lines: [{ id: "l3f",           // stable, unique within the drawing
               util: "gas",
               pts: [[lng,lat], …], // >= 2 points; a curve is a densified polyline
               shape: "line",       // "line" | "curve" | "square" — editor hint, renderers ignore it
               size: "", material: "", remark: "",   // 14e
               labelAt: 0.5 }],     // 14f: 0..1 position of the label along the line
     notes: [{ id: "n1", at: [lng,lat], text: "" }]
   }
   ```
   Rename `segments` → `lines` deliberately: the meaning changed from "a two-point segment" to "an
   N-point polyline", and a stale reader must fail loudly rather than misread `s.a`.
2. `static/src/core/locate_geo.js` — add and export:
   `emptyDrawing()` returns `{ v: 3, lines: [], notes: [] }`; `isGeoDrawing(d)` accepts `d?.v === 3`;
   `geoDrawing(d)` returns v:3 as-is, **upgrades v:2 in memory** (`segments[i] → { id: "s"+i, util,
   pts: [a, b], shape: "line", size: "", material: "", remark: "", labelAt: 0.5 }`,
   `notes[i] → { id: "n"+i, …n }`), and returns empty for anything else;
   `newId(prefix)` for fresh features; `lineMetres(line)` summing `haversineKm` over consecutive pairs
   (replacing `segMetres`, which stays exported as a thin wrapper only if something still needs it —
   nothing should); `pointAlong(line, t)` returning the `[lng,lat]` at fraction `t` of the polyline, used
   by every label renderer; `segLabel(line, utils)` returning the label string so the map, the SVG preview
   and the PNG builder all call **one** function.
3. `static/src/core/locate_geo.js` — `points()` (`:36-45`) flattens `l.pts` instead of `s.a`/`s.b`;
   `projectDrawing` (`:51-80`) returns `lines: [{ pts: [{x,y}, …], util, metres, size, material, labelAt,
   labelPx: {x,y} }]` instead of `segments: [{x1,y1,x2,y2,…}]`. Keep `mPerPx`, `w`, `h`, `notes`
   unchanged. **Do not add a bearing parameter** — north-up is the invariant (see `:62`).
4. `controllers/export.py` — mirror all of step 2–3 in `project_drawing` (`:25-53`): accept `v == 3`,
   upgrade `v == 2` through a new module-level `upgrade_drawing(d)`, reject everything else, and emit
   polyline point lists. Update the header comment at `:12-13`. Draw with `pdf.lines([...])` or a
   `pdf.beginPath()` path instead of the single `pdf.line` at `:124`; label position comes from the
   mirrored `point_along` rather than the midpoint arithmetic at `:128`.
5. New file `models/locate_geo.py` — put `upgrade_drawing` there and import it into both
   `controllers/export.py` and the migration script, so there is exactly one Python copy.
6. New file `migrations/19.0.1.1.0/post-migrate.py` (the `migrations/` directory does not exist yet) —
   rewrite every stored `drawing` through `upgrade_drawing`, and bump `'version'` in
   `__manifest__.py:4` from `19.0.1.0.0` to `19.0.1.1.0`. **A `post_init_hook` cannot be used**:
   `__manifest__.py:51` declares one (defined at `__init__.py:5`), and it runs on install only, never
   on `-u` (see Landmines).
7. `models/strataflow_workorder.py:132` — the completion guard becomes
   `if not (self.drawing or {}).get('lines') and not (self.drawing or {}).get('segments')`, so a
   not-yet-migrated record still completes. Update the field comment at `:46-47`.
8. `static/src/core/strataline_map.js` — `drawingData()` (`:539-554`) emits one `LineString` per line with
   `coordinates: l.pts`, and adds `id: l.id` (and `kind: "line"` / `"note"`) to `properties` so features
   can be addressed. Label text comes from `segLabel()`. Keep `dashed`, `color`, `live` as they are.
   `drawDown`/`drawMove`/`drawUp` (`:632-672`) build `this.live` as `{ id: newId("l"), util, pts: [at, at] }`
   and commit with `pts: [a, b]` — the two-point drag stays the default gesture in 14a.
9. `static/src/core/locate_canvas.js` — `segments` getter (`:31-33`) becomes `lines`; the `hint` getter
   (`:63-71`) sums `lineMetres`; `undo` (`:77-79`) and `clear` (`:81-83`) operate on `lines`.
   Also `static/src/screens/locator.js:175` (`hasLines`) and `static/src/screens/workorders.xml/js`
   wherever `drawing.segments` is read.
10. `static/src/core/locate_preview.js` + the template at `static/src/core/shell.xml:163-166` — render
    `<polyline points="…">` instead of `<line>`, label at `s.labelPx`.
11. `static/src/screens/workorders.js:282-286` — same change in the PNG string builder, using `segLabel()`.
12. `static/src/screens/workorders.js:300-314` — CSV becomes two blocks: `line,id,utility,size,material,
    vertices,metres` and `vertex,line_id,seq,longitude,latitude`; the notes block gets its missing index
    column (the `:310`/`:311` mismatch).
13. `static/src/core/audit.js` — `auditDrawing` (`:8-44`) and `linesByUtility` (`:46-55`) read `d.lines`
    and use `lineMetres`. The < 2 m / > 90 m thresholds at `:27`/`:30` now apply to whole-polyline length,
    which is the right meaning.

### 14b — north: compass, reset, and no rotation while drawing (independent, smallest)

1. `static/src/core/strataline_map.js:311-317` — add `pitchWithRotate: false` and a new prop
   `rotatable` (default `true`); when false, call `map.dragRotate.disable()`,
   `map.touchZoomRotate.disableRotation()` and `map.keyboard.disableRotation()` after construction.
2. `static/src/core/strataline_map.js:613-630` (`setTool`) — when a tool activates and
   `map.getBearing() !== 0`, call `map.resetNorth({ duration: this.reducedMotion ? 0 : 300 })` (the
   `reducedMotion` getter already exists at `:363-365`) and disable rotation for the duration of the tool;
   restore on "pan".
3. `static/src/core/strataline_map.js` — track bearing in `state` via `map.on("rotate", …)` next to the
   existing `map.on("move", …)` at `:610`, and expose `resetNorth` on the `onReady` API at `:343`
   alongside `zoomIn`/`zoomOut` (the rails at `static/src/screens/locator.js:198-207` and
   `static/src/screens/dispatch.js:212-221` already consume that object — follow their null-map
   notification pattern).
4. `static/src/core/strataline_map.xml` — a compass button inside `.o_sf_map`, a glass chip with an
   arrow rotated by `-bearing` degrees, `aria-label="Reset north"`, hidden when bearing is 0 and no tool
   is active; plus a static `N ↑` chip while a draw tool is active, matching the preview caption at
   `static/src/core/shell.xml:162`. **Write our own button — do not use `maplibregl.NavigationControl`**
   (see Landmines: `maplibre-gl.css` loads after our stylesheet).
5. `static/src/strataflow.scss` — style the compass next to `.o_sf_bm` (`:185`) and
   `.o_sf_canvas_hint` (`:190`); add it to the print-hiding list at `:406`.

### 14c — selection, hit-testing, handles, moving, and a real undo (depends on 14a)

1. `static/src/core/strataline_map.js` — new tool value `"select"`. `setTool` (`:613-630`) must **keep
   `dragPan` enabled** for it and only disable it for the lifetime of an actual drag on a hit feature.
2. `static/src/core/strataline_map.js` — hit-testing on `mousedown`/`mousemove`:
   `map.queryRenderedFeatures([[x-6, y-6], [x+6, y+6]], { layers: [...] })`. Query order is priority
   order: `sf_locate_vertex` → `sf_locate_vertex_ghost` → `sf_locate_note_dot`/`sf_locate_note` →
   `sf_locate_line`/`sf_locate_line_gas`/`sf_locate_label`. Include the label layer: it renders the
   *same* feature as the line, so `properties.id` matches and the hit target grows for free.
   Set `map.getCanvas().style.cursor` to `"move"`/`"pointer"` on hover.
3. `static/src/core/strataline_map.js` — a **second** GeoJSON source `sf_locate_edit` plus two circle
   layers, `sf_locate_vertex` (solid, r 5.5) and `sf_locate_vertex_ghost` (hollow, r 4, midpoints, for
   insert). Features carry `{ fid, vi, ghost }`. Add them **after** the `sf_locate` layers in
   `syncDrawing` (`:556-595`) so they draw on top, and rebuild them from the same `style.load` handler
   (`:322-327`) — `setStyle` wipes every source and layer, which is why `syncDrawing` is called there.
4. `static/src/core/strataline_map.js` — drag machinery: `mousedown` on a vertex sets
   `this.edit = { fid, vi }` and disables `dragPan`; `mousemove` writes into a local `this.editLive`
   drawing copy and calls `syncDrawing()`; `mouseup` commits **once** via `props.onDraw` and re-enables
   `dragPan`. **Never call `props.onDraw` from `mousemove`** — it would restart the 600 ms debounce at
   `static/src/screens/locator.js:232` and fire its `orm.write` (`:240`) repeatedly through the drag. Same three-phase
   pattern as the existing `this.live` at `:647`/`:656`/`:665`.
5. Dragging the line body (not a handle) translates every vertex by the pointer's lng/lat delta;
   dragging a note dot moves `at`. Both commit on `mouseup`.
6. `static/src/core/locate_canvas.js` — replace `undo()` (`:77-79`) with a bounded snapshot stack:
   `this.history = []` as a **plain instance field, not `useState`**, push
   `JSON.parse(JSON.stringify(previousDrawing))` on every `onDraw` (strip the Owl reactive proxy), cap at
   30, `undo()` pops and calls `props.onChange`. The pop-last-segment model is wrong the moment a move or
   a label edit exists. Redo is explicitly out of scope. The stack resets per ticket for free, because
   `LocateCanvas` is keyed `t-key="sel.id"` (`static/src/screens/locator.xml:118`,
   `static/src/screens/workorders.xml:95`).
7. `static/src/core/locate_canvas.js:39-45` — add "Select" to the `tools` getter, before the utilities;
   add a Delete button enabled only when something is selected.

### 14d — multi-vertex, curve and square drawing (depends on 14a, 14c)

1. `static/src/core/strataline_map.js:632-672` — after `drawUp` commits a two-point line, keep it as the
   *active* line: a subsequent click appends a vertex to `pts`, Escape or double-click ends it. Keep the
   `MIN_SEGMENT_M` (`:20`) reject for the first drag only.
2. Square mode: constrain each appended vertex to the nearest 45° from the previous vertex, computed in
   local metres (reuse the `mPerDegLng` maths at `locate_geo.js:61`). Pure input constraint, no format
   impact.
3. Curve mode: on release, replace the last span with a densified arc (quadratic through the drag's
   control point, sampled at up to 24 points, first and last preserved exactly) and set
   `shape: "curve"`. Densification lives in `static/src/core/locate_geo.js` so nothing else needs curve
   maths — this is what keeps `controllers/export.py` untouched by curves.
4. Vertex insert/delete: click a ghost handle inserts, Alt-click or a Delete key on a selected vertex
   removes it (refuse below 2 points).
5. `static/src/core/locate_canvas.js:39-45` and the `LocateCanvas` toolbar at
   `static/src/screens/workorders.xml:125-135` — mode chips (Line / Curve / Square) next to the utility
   chips.

### 14e — right-click attribute editor: size, material, and note re-edit (depends on 14a, 14c)

1. `static/src/core/strataline_map.js` — bind `map.on("contextmenu", …)` (supported in MapLibre 5.24) in
   `bindDraw` (`:597-611`); hit-test as in 14c; `e.preventDefault()`. On touch, a 500 ms press with
   < 8 px movement on `touchstart`/`touchmove` opens the same editor — there is no right click on a phone
   and the Locator screen is the field tool.
2. New file `static/src/core/locate_editor.js` + its template — an Owl popover component with Size (free
   text: `2"`, `50 mm`), Material (a short `<select>`: PE, PVC, steel, copper, HDPE, concrete, cast iron,
   fibre, unknown, plus "other…" that reveals a text input), Remark (free text), and Delete. For a note,
   the same popover shows just the text field, which is the missing note re-edit path.
3. Open it through the **stock popover service**: `usePopover` from
   `@web/core/popover/popover_hook` (stock: `addons/web/static/src/core/popover/popover_hook.js:55`),
   exactly as `static/src/screens/workorders.js:57` already does with `AssignLocatorPopover`. The service
   requires a real `HTMLElement` target (`addons/web/static/src/core/popover/popover_service.js:65` calls
   `target.getRootNode()`), so anchor it to a 1×1 absolutely-positioned div placed at the pointer inside
   `.o_sf_map` — the same trick `trackNote()` (`:682-687`) already uses for the note input. Pass
   `useBottomSheet: true` on touch to get the stock bottom sheet
   (`addons/web/static/src/core/bottom_sheet/bottom_sheet_service.js:71`).
4. Label rendering, all five sites, from one `segLabel()` in `locate_geo.js`: line 1 stays
   `G 12.4 m`, line 2 is `2" PE` when either field is set. Emit a single string with `\n` and add
   `"text-max-width": 12` to `sf_locate_label` (`:581-585`) — keep `text-allow-overlap: true`, because a
   locate print must show every measurement. SVG preview (`shell.xml:165`) and PNG
   (`workorders.js:285`) get a second `<text>` at `+11 px`; the PDF (`export.py:128`) gets a second
   `drawCentredString` at 7 pt, `2 mm` lower.
5. `static/src/core/audit.js` — add a `warn` finding when a drawn line has neither size nor material,
   alongside the existing per-segment checks at `:25-33`.

### 14f — the measurement label: repositionable, with end ticks (depends on 14a, 14c)

1. `static/src/core/locate_geo.js` — `labelAt` (0..1) is honoured by `pointAlong`, and `projectDrawing`
   returns `labelPx` from it.
2. `static/src/core/strataline_map.js` — the label becomes its **own** Point feature in `sf_locate` at
   `pointAlong(line, labelAt)` rather than a `symbol-placement: "line-center"` symbol on the line
   feature; `sf_locate_label` (`:581-585`) switches to a point-placed symbol. It then drags with the same
   14c machinery, writing `labelAt` back.
3. End ticks: `drawingData()` emits two short perpendicular `LineString` features per line with
   `properties.tick = true`, drawn by the existing `sf_locate_line` layer at a thinner width. Mirror the
   perpendicular maths once in `controllers/export.py` and once in the SVG/PNG builders — all three draw
   plain straight lines, so there is no new primitive anywhere.
4. Do **not** implement a typed distance override unless Stefan answers Decision 1 with (b).

## Files

| path | what changes |
| --- | --- |
| `addons/strataflow_workorder/static/src/core/locate_geo.js` | v:3 shape + doc header, `emptyDrawing`/`isGeoDrawing`/`geoDrawing` with the v:2 upgrade, `newId`, `lineMetres`, `pointAlong`, `segLabel`, curve densification, `points()`/`projectDrawing` over polylines |
| `addons/strataflow_workorder/static/src/core/strataline_map.js` | feature ids in `drawingData`, polyline geometry, `sf_locate_edit` source + vertex layers, hit-testing, drag/move, multi-vertex + curve + square drawing, `contextmenu`/long-press, rotation control + `resetNorth` on the ready API, point-placed label |
| `addons/strataflow_workorder/static/src/core/strataline_map.xml` | compass button, `N ↑` chip, the popover anchor div |
| `addons/strataflow_workorder/static/src/core/locate_canvas.js` | `lines` getters, Select tool, mode chips, snapshot-stack undo, Delete |
| `addons/strataflow_workorder/static/src/core/locate_preview.js` | polyline projection output, `labelPx`, two-line label |
| `addons/strataflow_workorder/static/src/core/shell.xml` | `LocatePreview` template `:163-166`: `<polyline>`, label at `labelPx`, spec second line, end ticks |
| `addons/strataflow_workorder/static/src/core/audit.js` | `d.lines` + `lineMetres`; new "no size/material" finding |
| `addons/strataflow_workorder/static/src/core/locate_editor.js` | **new** — the size/material/remark popover, and note re-edit |
| `addons/strataflow_workorder/static/src/screens/workorders.js` | PNG builder over polylines via `segLabel`, CSV line/vertex blocks + the `:310`/`:311` notes-header fix |
| `addons/strataflow_workorder/static/src/screens/workorders.xml` | `LocateCanvas` toolbar: Select + mode chips |
| `addons/strataflow_workorder/static/src/screens/locator.js` | `hasLines` reads `lines` |
| `addons/strataflow_workorder/static/src/strataflow.scss` | compass chip, vertex-handle cursors, editor popover, print-hide list at `:406` |
| `addons/strataflow_workorder/controllers/export.py` | `project_drawing` over polylines, `upgrade_drawing` import, path drawing, two-line label, end ticks, updated `:12-13` comment |
| `addons/strataflow_workorder/models/locate_geo.py` | **new** — the single Python `upgrade_drawing`, shared by the controller and the migration |
| `addons/strataflow_workorder/models/strataflow_workorder.py` | completion guard `:132` accepts `lines`; field comment `:46-47` |
| `addons/strataflow_workorder/migrations/19.0.1.1.0/post-migrate.py` | **new** — one-time v:2 → v:3 rewrite of every stored drawing |
| `addons/strataflow_workorder/__manifest__.py` | `'version'` at `:4` bumped to `19.0.1.1.0` so the migration runs |

## Landmines

- **`controllers/export.py` mirrors `locate_geo.js` in Python and the two must stay in step** — the file
  says so itself at `:12-13`. Every geometry or label change in this task is a double change. This is the
  single biggest risk in 14a: verify the PDF against the SVG preview for the *same* drawing, not just
  "the PDF renders".
- **A drawing whose `v` does not match is silently treated as empty** (`locate_geo.js:28-30`). Ship the
  v:3 reader *before* anything writes v:3, or every in-flight drawing reads blank with no error. The
  browser must be checked, not just the DB.
- **`post_init_hook` runs on install, never on `-u`** (`__manifest__.py:51`). The v:2 → v:3 rewrite must
  be an `migrations/<version>/post-migrate.py` with a manifest `version` bump, or it will never run on a
  live database.
- **`map.isStyleLoaded()` is not "the style is ready"** — it returns false while any tile streams. Guard
  the new `sf_locate_edit` source and vertex layers on `this.styleReady`, set in the `style.load` handler
  at `strataline_map.js:322-327`, exactly as `syncDrawing` does at `:557-560`. Getting this wrong is how
  drawings previously saved to the DB and never rendered.
- **`setStyle` destroys every source and layer.** The theme toggle and the basemap switch call it
  (`strataline_map.js:253-261`). Anything added in 14c must be re-added from the `style.load` handler or
  it vanishes when the locator switches to Satellite mid-edit.
- **`maplibre-gl.css` is lazy-loaded *after* our stylesheet** (`strataline_map.js:45`). Do not use
  `maplibregl.NavigationControl` for the compass — write our own glass button. If any MapLibre-classed
  element must be styled, use more than one class of specificity, and never restyle a `Marker`'s
  position: MapLibre sets it with an inline `transform`.
- **`setFilter` replaces a layer's baked filter.** `applyVisibility` (`strataline_map.js:369-399`)
  composes `["all", baked, clause]` at `:385`. New `sf_locate_*` layers get their filters at creation
  (`:570`, `:576`, `:582`, `:587`, `:591`); never call `setFilter` on them with a bare clause.
- **Sass eats CSS `min()`/`max()` with mixed units.** `min(52%, 460px)` threw
  "Incompatible units: px and %", broke the whole bundle, and Odoo then served the *previous* CSS behind
  a small red banner — so it looks like the change did nothing. Grep any new SCSS for `min(`/`max(`.
- **Odoo compiled CSS is not whitespace-minified**, so verify style changes with regexes, not exact
  substrings.
- **Quote grep globs in zsh**: `--include=*.js` unquoted expands and the flag silently disappears (this
  happened while researching this brief).
- **`-u strataflow_workorder` after every Python/XML/JS/SCSS change** — a plain reload serves a stale JS
  bundle, and this task is almost entirely JS.
- **"Verified server-side" is not verified.** Vertex dragging, right-click, long-press and the compass
  are all pointer behaviour: they must be exercised in the browser automation tab.
- **New, found while reading**: `LocateCanvas` is mounted on **two** screens
  (`locator.xml:118`, `workorders.xml:95`), so every toolbar addition also lands in the dispatcher's Work
  Orders screen. Decide deliberately whether a dispatcher may edit a locator's drawing after
  `action_complete_locate` — today nothing stops them.
- **New**: the CSV notes block already has a header/row column mismatch
  (`workorders.js:310` vs `:311`). Do not preserve it.

## Acceptance criteria

- [ ] A drawing stored as `{v: 2, segments: […]}` opens, renders identically in the map, the preview, the
      PNG, the PDF and the CSV, and is rewritten as `{v: 3, lines: […]}` on the next save; a drawing with
      no `v` or `v: 1` still reads as empty.
- [ ] `migrations/19.0.1.1.0/post-migrate.py` runs on `-u` and leaves zero `"v": 2` rows in
      `strataflow_workorder.drawing`.
- [ ] `controllers/export.py` and `static/src/core/locate_geo.js` produce the same projected geometry: the
      PDF and the on-screen preview of the same drawing are visibly the same shape at the same scale.
- [ ] A line can hold more than two vertices; a curve renders as a smooth densified polyline in all five
      renderers; a square-mode line snaps each span to 45°.
- [ ] Clicking a drawn line selects it and shows vertex handles; dragging a handle moves that vertex;
      dragging the line body moves the whole line; dragging a note moves it. Each commits exactly one
      `orm.write` after the pointer is released, not during the drag.
- [ ] Undo reverses the last operation of any kind — draw, move, edit, delete — not just the last drawn
      line, up to 30 steps, and resets when the selected ticket changes.
- [ ] Right-clicking a line (or long-pressing it on a touch device) opens an editor with Size, Material
      and Remark; the values render as a second label line on the map, the preview, the PNG and the PDF
      without overlapping the metre reading.
- [ ] Right-clicking or long-pressing an existing note reopens its text for editing.
- [ ] The measurement label can be dragged along its line and its position persists.
- [ ] The map shows a compass whenever the bearing is not 0; clicking it returns to north; activating any
      draw or edit tool resets the bearing to 0 and prevents rotation until the tool is released.
- [ ] `action_complete_locate` still refuses a ticket with no drawn lines, for both v:2 and v:3 records.
- [ ] The audit still reports per-line lengths and flags lines outside the 2 m / 90 m band, now using
      whole-polyline length.

## Verification

```bash
cd /Users/stefan/strataflow
# 1. a v:2 record to migrate from, captured before any code change
psql strataflow_dev -c "select id, drawing from strataflow_workorder where drawing::text like '%\"v\": 2%' limit 3;"

# 2. run the migration + reload the bundle
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  --dev=xml --http-port=8069 --log-level=warn -u strataflow_workorder

# 3. no v:2 left, and the new shape is what landed
psql strataflow_dev -c "select count(*) from strataflow_workorder where drawing::text like '%\"v\": 2%';"   # expect 0
psql strataflow_dev -c "select drawing from strataflow_workorder where drawing::text like '%\"v\": 3%' limit 1;"

# 4. the PDF still builds for a migrated ticket (replace <id>)
curl -s -o /tmp/locate.pdf -w '%{http_code} %{size_download}\n' \
  --cookie "$SESSION" http://localhost:8069/strataflow/workorder/<id>/locate.pdf

# 5. the SCSS bundle actually compiled — a Sass error serves the PREVIOUS CSS behind a small banner
grep -ri "o_sf_compass" addons/strataflow_workorder/static/src/strataflow.scss
psql strataflow_dev -c "select name from ir_attachment where name like 'web.assets_backend%.css' order by create_date desc limit 1;"
```

In the browser automation tab (login `admin`/`admin`; never type the password — hand the tab a curl
session cookie, DEVLOG 2026-09-08):

1. `/odoo/locator` → pick an open ticket → **Draw**. Drag a gas line. Confirm the label reads
   `G <n> m` and the line is dotted.
2. Right-drag the map to rotate: with 14b in, the bearing must snap back to 0 the instant a utility chip
   is active, and the compass chip must appear and reset the map when clicked.
3. Draw a line, then click to extend it past two vertices; switch to Curve and draw an arc; switch to
   Square and confirm each span snaps to 45°.
4. Switch to Select. Click the line — handles appear. Drag a middle handle, a ghost midpoint handle, the
   line body, and a note dot. Watch the Network tab: **one** `web_save`/`write` per released drag, ~600 ms
   after mouseup, never during.
5. Right-click the gas line → set Size `2"`, Material `PE`. Confirm the second label line on the map.
   Long-press the same line on a touch-emulated viewport and confirm the same editor opens.
6. Right-click an existing note and re-type its text.
7. Press Undo repeatedly and confirm it reverses the label edit, then the moves, then the draws, in order.
8. Go to **Review**. The preview must show the same shapes with `N ↑ · 1 px ≈ … m` and the spec lines.
   Export PNG and PDF and compare all three against each other and against the live map.
9. Export CSV and confirm the line block, the vertex block and the note block all have matching column
   counts.
10. Open the same ticket on `/odoo/workorders` and confirm the canvas there renders and behaves the same.
11. Toggle theme and switch to Satellite mid-edit: the drawing, the vertex handles and the compass must
    all still be there (this is the `style.load` re-add path).
12. Read the browser console: zero errors, in particular no `sf_locate_edit` source/layer warnings.

Review the UI with the `apple-design` skill before and after, per CLAUDE.md.
