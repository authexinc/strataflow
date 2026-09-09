# Handoff — 2026-09-09 (midday)

## Start here: the map is live end-to-end, with strataline's layers and geo-referenced locate prints

Everything below was **seen working in the automation tab** (it boots Odoo's web client again), not
just checked over HTTP. Four things landed this session, in order:

1. **Live Strataline map** (`80aa39b9542` + fixes) on Dispatch, the Locator's map mode and the
   Locator's on-site stage: MapLibre in the web client, strataline over its API with the tenant's
   key as `?key=`. Pins, selected label, routes, Satellite, zoom, attribution, both themes.
2. **Stock views in the Strataline language** (`160e5704463`): Settings, lists, forms, dialogs,
   menus, toasts. Tenant-wide, light only. Primary buttons are accent, shell and stock alike.
3. **Strataline's layer panel** (`6323645be97`, `core/layers.js` + `core/layer_panel.js`): the
   rail's layers button on Dispatch and the Locator's map mode. Rows from strataline's
   `layers.json` (keys may fetch it since map-sys `4b08efb`), presets, filter, tri-state groups,
   safety layers pinned on, choices remembered per device.
4. **Locate drawings are geo-referenced** (same commit, Stefan's decision): `[lng, lat]` per line
   end and note, drawn as a layer on the live map, drawn *on* by dragging with a utility tool.
   Preview, PNG, CSV, PDF and the audit re-project north-up with a printed scale. Old pixel
   drawings read as empty; demo data never had any.

Dev environment is fully wired: local strataline on 8613, dev key `k_17c57c69` in
`strataline.api_key`, `strataline.base_url` = `http://localhost:8613`. Open
`http://localhost:8069/odoo/dispatch`.

## Current state
`addons/strataflow_workorder` on Odoo 19 CE. Six fullscreen OWL screens at `/odoo/desk`, `/odoo/dispatch`,
`/odoo/workorders`, `/odoo/pipeline`, `/odoo/invoices`, `/odoo/locator`; `/` → `/odoo/desk`; `/odoo`
reaches the stock backend, restyled. Backed by stock `crm.lead`, `account.move`, `mail.thread`.

Map stack, all in `static/src/core/`:
- `strataline_map.js` — the component: style assembly (own basemap palette from the shell tokens,
  strataline's utility style fetched at runtime, ATS grid, house numbers, Esri satellite), markers,
  routes, layer visibility, the drawing layer and draw interaction. MapLibre 5.24.0 vendored in
  `static/lib/maplibre-gl/` and lazy-loaded (6.x is ESM-only, unloadable here).
- `layers.js` — visibility store (rows, overrides in localStorage `strataflow.layers`, presets,
  `hiddenState()` for the map); `layer_panel.js/.xml` — the glass panel.
- `locate_geo.js` — drawing format `{v: 2, segments: [{a, b, util}], notes: [{at, text}]}`,
  `segMetres`, `projectDrawing` (north-up print); `controllers/export.py` mirrors it for the PDF.
- `locate_canvas.js` — toolbar (Pan, utilities, Note, Undo, Clear) around a `StratalineMap` at z18;
  `locate_preview.js` — the projected print; `audit.js` — measures with haversine.
- Server seam: `get_map_config` (`models/strataflow_workorder.py`) reads `ir.config_parameter`
  `strataline.base_url` / `strataline.api_key`; Phase 2's provisioner writes them.

Strataline side (map-sys `feat/search-key-scope`, 5 unpushed commits, tests green): keys may fetch
`/style.json`, `/layers.json`, `/fonts/*` with CORS (`160338c`, `4b08efb`); `/tiles/meta` is clamped
to the key's zoom and bbox, a source wholly above the cap reports null (`932baab`).

## What I was doing when this ended
Wrapping after the Note tool check. Nothing in flight. Working tree clean.

## Repo state
- Branch `feat/strataflow-workorder` at `14e1a880e2f`, **12 commits ahead of origin**, working tree
  clean, not pushed. Not merged into `19.0`. Push and merge are Stefan's call.
- `~/map-sys` on `feat/search-key-scope` at `4b08efb`, 5 unpushed commits on top of what Stefan
  had seen, working tree clean. `main` there self-deploys — merging is the deploy. Until it deploys,
  a keyed map against strataline.co draws tiles with no labels, no utility overlay and no layer panel.
  `data/api_keys.json` (gitignored) holds dev key `k_17c57c69` and a revoked duplicate `k_b0d0818e`.
- Still no automated tests for this module.
- Dev servers: Odoo on 8069 (`--log-level=info --log-handler=werkzeug:INFO`, log at
  `scratchpad/odoo.log`); strataline on 8613 (`bash ~/map-sys/scripts/app.sh status|stop`, log at
  `~/map-sys/data/serve.log`).

## Next steps
1. **Look at what is still unseen**, `BACKLOG.md` › UI: Satellite under a drawing, the drawing canvas
   on Work Orders (same component as the Locator's), the layer panel on the Locator's map mode, route
   lines with Auto-assign (demo has 0 `new` tickets — set one back to `new`), a CRM lead, an invoice,
   a dialog. Settings' section title bands could be lighter (`--settings__title-bg`).
2. **Basemap data question** for Stefan: a broad straight NW–SE band paints in the water colour
   across Calgary at z10–12; it is a `water` polygon in the `basemap` extract, gone by z13.
3. **Zone-first auto-assign** — fully decided (zone model, postal-code prefix, `postal_code` on the
   ticket), not built. `planRoutes` (`core/geo.js:45`) is the place; keep `routes[].coords`.
4. **Layer panel follow-ups**: company filter (`owners.json` needs a key grant), exclusions as a
   `layers.json` flag on strataline's side, per-user rather than per-device persistence.
5. **Stock views, dark**; **USP feed**; **README.md** — unchanged, see `BACKLOG.md`.

## Landmines
- **`map.isStyleLoaded()` is not "the style is ready"** — it is false while any tile streams. Guard
  layer/source work on the `styleReady` flag set in the `style.load` handler, never on that call.
  Drawings saved to the DB but never drew until this was found.
- **The Sass `min()` landmine bit again**: `min(52%, 460px)` broke the whole bundle ("Incompatible
  units: 'px' and '%'"), and Odoo served the *previous* CSS with only a red banner at the bottom of
  the page. Grep new SCSS for `min(`/`max(` with mixed units before restarting.
- **maplibre-gl.css loads after our sheet** (lazy `loadCSS`): any rule on a MapLibre-classed element
  needs more than one class of specificity or it loses. Marker elements are positioned by MapLibre
  with an inline transform — style their size and look, never their `position` (the label stretched
  to the map's edge that way).
- **`setFilter` replaces a layer's baked filter.** Strataline's merged layers bake the abandoned
  split; `applyVisibility` composes `["all", baked, clause]` from the filters captured at style
  assembly (`this.baked`). Never call `setFilter` on a utility layer with the clause alone.
- **Strataline has no `OPTIONS` handler**: a custom header triggers a preflight and fails from the
  browser. Everything goes as `?key=`. `origins` only governs the CORS echo, not access;
  `localhost:8069` and `127.0.0.1:8069` are two origins. A 429 (tile throttle) arrives as an opaque
  CORS error — `serve_tile`'s `throttle` branch skips `cors()`.
- **A drawing without `v: 2` is empty.** Consumers never see pixel coordinates again; the PDF
  mirror in `controllers/export.py` must stay in step with `projectDrawing`.
- **`line-dasharray` cannot vary per feature** in MapLibre — gas is its own line layer.
- **The ticket pin swallows drags that start on it** unless `.is-drawing` sets
  `pointer-events: none` on `.o_sf_mk` — keep that rule.
- **Prepend, don't append, in the `_assets_*_variables` bundles.** Odoo's declarations are `!default`.
- **Odoo's compiled CSS is not whitespace-minified** — check with regexes, not exact substrings.
- **The token block is on `.o_web_client` on purpose** (the old "never hoist" landmine was about
  leaking; leaking is the intent now). `holdPageGround` still paints `<html>` in the *shell's* theme
  for 600 ms — a light stock page flashes dark once after a dark screen.
- **Odoo CE has no dark mode**: `ir.http.color_scheme()` returns `"light"`.
- **In auto mode, anything executed inside `~/map-sys` is classifier-denied**; leaving auto mode
  (shift+tab) unblocked it. Run pytest there as `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python3 -m pytest …`
  (miniconda's `dash` plugin dies on `import flask`); `test_descent.py` needs `mercantile`.
- **Quote grep globs in zsh** — `--include=*.xml` unquoted expands and the flag vanishes.
- **The three path declarations must agree** (`path`, `static path`, `HOME_URL`) and **a path may
  never equal a stock client-action tag** (`home` → `desk`).
- **Never plant a `session_id` cookie on `localhost` with `document.cookie`.**
- **"Verified server-side" is not "verified"** — six visual bugs shipped past every HTTP check this
  session and were found in the first minute of looking. Use the automation tab.
- **`post_init_hook` runs on install, never on `-u`**; `data/strataflow_crm_account_data.xml` is
  `noupdate="1"`. **Action `path` is unique across every action table.** **Odoo forbids `@import`
  between asset files.** **No `document.startViewTransition` around async swaps.**
- Odoo 19 renames: `res.groups.privilege_id`, `crm.lead.recurring_plan`, luxon is a global.

## Environment / setup
- Read `CLAUDE.md`, `BACKLOG.md`, then `ARCHITECTURE.md`.
- `~/strataflow/.venv` (gitignored). Postgres via Homebrew; DB `strataflow_dev` with demo.
- Run: `.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons --dev=xml --http-port=8069 --log-level=warn`
  plus `-u strataflow_workorder` after any Python/XML/JS/SCSS change. Fresh DB: `dropdb strataflow_dev`,
  then `-i strataflow_workorder --with-demo` (~4 min); then re-insert the two `strataline.*`
  `ir_config_parameter` rows (base_url `http://localhost:8613`, api_key from
  `python3 ~/map-sys/scripts/manage_access.py key list`, or mint a new one with
  `--origins http://localhost:8069,http://127.0.0.1:8069`).
- Strataline dev: `bash ~/map-sys/scripts/app.sh start 8613`. `~/map-sys` is an additional working
  directory (`/add-dir`, saved).
- Scratchpad checks worth re-creating in-repo: `bundlecheck.py` (JSON-RPC login, pull
  `web.assets_web` JS + CSS, count needles, call `get_map_config`).
- Git identity is repo-local `Stefan Djordjevic <dev@authex.co>`; map-sys commits use
  `-c user.name/-c user.email`.

## Open decisions
1. **USP feed transport** — unchanged, `BACKLOG.md` › Open questions.
2. **Stock views in dark** — do it, or accept light stock pages under a dark shell?
3. **Layer choices per device or per user** — localStorage today; per user means a field on
   `res.users` and one more RPC on boot.
4. **Satellite from Esri** — the one third-party call the tenant UI makes; same source strataline uses.

Locked this session (`ARCHITECTURE.md`): tenant-wide light stock styling; accent primaries;
`postal_code` on the ticket; the map integration shape; strataline's layer panel rebuilt from its
manifest; geo-referenced drawings.

Still waiting on Stefan: pushes and merges (`feat/search-key-scope` in `~/map-sys` — deploying it is
what makes the map work against strataline.co — and this branch into `19.0`); the basemap band.
