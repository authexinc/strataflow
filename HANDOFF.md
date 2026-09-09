# Handoff — 2026-09-09 (small hours)

## Start here: map, layer panel and geo drawings are built and seen working in a browser

Since the first wrap, on Stefan's two follow-ups: **strataline's layer panel** lives behind the rail's
layers button (Dispatch and the Locator's map mode) — `core/layers.js` + `core/layer_panel.js`, rows
from strataline's `layers.json` (keys may fetch it since map-sys `4b08efb`); and **locate drawings
are geo-referenced** and drawn on the live map (`core/locate_geo.js`, decided by Stefan) — the
drawing surface on Work Orders and the Locator's draw stage is a map with a toolbar. Old pixel
drawings read as empty. Details in the top DEVLOG entry.

1. **Live Strataline map** on Dispatch and the Locator's map mode (`80aa39b9542`), MapLibre in the web
   client, strataline over its API with the tenant's key. **Dev is fully wired**: local strataline on
   8613, dev key `k_17c57c69` in `strataline.api_key`, `get_map_config` says `connected: true`, and with
   that key `/style.json`, `/tiles/meta`, glyphs and downtown tiles all answer 200 with CORS for
   `http://localhost:8069`. Open `http://localhost:8069/odoo/dispatch` in a normal tab.
2. **Stock views in the Strataline language** (`160e5704463`): every form, list, kanban, dialog, Settings
   page. Tenant-wide, light only. Primary buttons are accent now, shell and stock alike.

Seen in the automation tab (it boots the web client again): Dispatch both themes + Satellite + zoom +
pins + label + utility overlay, the Locator's on-site map and map mode, Settings, the Records list, the
ticket form. `BACKLOG.md` › UI lists what is still unseen (route lines, a dialog, CRM/invoice forms) and
one basemap data question for Stefan (a water-coloured band across Calgary at z10–12).

## Current state
`addons/strataflow_workorder` on Odoo 19 CE. Six fullscreen OWL screens at `/odoo/desk`, `/odoo/dispatch`,
`/odoo/workorders`, `/odoo/pipeline`, `/odoo/invoices`, `/odoo/locator`; `/` → `/odoo/desk`; `/odoo`
reaches the stock backend, now restyled. Backed by stock `crm.lead`, `account.move`, `mail.thread`.

Landed this session:
- `core/strataline_map.js` + `.xml` — the map component; `static/lib/maplibre-gl/` — MapLibre 5.24.0
  (UMD; 6.x is ESM-only and unloadable here), lazy-loaded. Dispatch and Locator use it; `FauxMap` stays
  as the not-connected fallback. `get_map_config` in `models/strataflow_workorder.py:145`.
- `static/scss/backend_variables.scss` (prepended to `web._assets_primary_variables`),
  `static/scss/backend_bootstrap.scss` (prepended to `web._assets_backend_helpers`),
  `static/src/stock/stock.scss` (material). Manifest comments say why prepend.
- `.o_sf_btn--primary` → accent (`strataflow.scss:151`).
- map-sys `160338c` on `feat/search-key-scope`: keys may fetch `/style.json` and `/fonts/*`, CORS
  echoed. 23/23 key tests pass, whole suite 125 pass (`test_descent.py` needs the `mercantile` package,
  pre-existing). Not merged, not deployed.
- Decisions locked in `ARCHITECTURE.md`: tenant-wide stock styling, accent primaries, `postal_code`
  on the ticket, the map integration shape. `BACKLOG.md` › UI has the two "look at it" items.

## What I was doing when this ended
Wrapping. Nothing in flight. `ARCHITECTURE.md` / `BACKLOG.md` / `DEVLOG.md` / this file are the
uncommitted changes; the wrap commit follows.

## Repo state
- Branch `feat/strataflow-workorder`, **12+ commits ahead of origin** (map `80aa39b9542`, revamp
  `160e5704463`, browser fixes, layer panel + geo drawings `6323645be97`, docs); not pushed. Not merged into `19.0`. Merge and push are Stefan's call.
- `~/map-sys` on `feat/search-key-scope` at `4b08efb` (5 unpushed commits on top of what Stefan has
  seen), working tree clean. `main` there self-deploys — merging is the deploy. `data/api_keys.json`
  (gitignored) holds the dev key `k_17c57c69` and a revoked duplicate `k_b0d0818e`.
- Still no automated tests for this module.
- A dev server is running on 8069 (`--log-level=info --log-handler=werkzeug:INFO`, log at
  `scratchpad/odoo.log`). Strataline is running on 8613 (`scripts/app.sh status|stop`, log at
  `~/map-sys/data/serve.log`).

## Next steps
1. **Look**: `BACKLOG.md` › UI lists what to check on the stock views and on the map. Anything off in the revamp is a one-line change in `stock.scss` or a variable
   in `backend_variables.scss`; the Odoo class map is in DEVLOG (2026-09-09) and the variable names in
   the manifest comments.
2. **Zone-first auto-assign** — fully decided now (zone model, postal-code prefix, `postal_code` on the
   ticket). Build: `strataflow.zone` model + many2many on `res.users`, the field + form line, the rule
   in `planRoutes`'s place (`core/geo.js:45`) feeding the same `routes[].coords` the map draws.
3. **Stock views, dark** — scoped in `BACKLOG.md` › UI; needs a `color_scheme()` override.
4. **USP feed** — still the open question; `BACKLOG.md` › Open questions.
5. **`README.md`** — still stock Odoo's.
6. Older: stored sort key on `strataflow.workorder`, tests for `action_invoice_closed` /
   `action_complete_locate`, `get_board_data` needs a domain/limit, tenancy Phase 2 (nginx prefix strip).

## Landmines
- **In auto mode, anything executed inside `~/map-sys` is classifier-denied** — pytest, `app.sh`,
  `manage_access.py`, heredoc patches. Stefan leaving auto mode unblocked it. Edits and `git commit`
  there work after `/add-dir`. Under miniconda's Python, run pytest as
  `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python3 -m pytest …` or a stray `dash` plugin dies on `import flask`.
- **Strataline has no `OPTIONS` handler**: a custom header (`X-Api-Key`) triggers a preflight and
  fails from the browser. Everything goes as `?key=`. `origins` only governs the CORS echo; it is not an
  access gate, and `localhost:8069` and `127.0.0.1:8069` are two origins.
- **Until `160338c` is deployed on strataline.co**, a keyed map against prod draws tiles with no labels
  and no utility overlay (403 on `/style.json` and `/fonts/*`). Against local 8613 it works once
  started. A strataline 429 (tile throttle) arrives as an opaque CORS error — `serve_tile`'s
  `throttle` branch skips `cors()`.
- **MapLibre 6.x cannot be loaded here** — ESM only. Stay on 5.x (`static/lib/maplibre-gl/README`).
- **Prepend, don't append, in the `_assets_*_variables` bundles.** Odoo's declarations are `!default`;
  an appended file comes after them and silently changes nothing. `('prepend', path)` in the manifest.
- **Odoo's compiled CSS is not whitespace-minified** — `border-radius: 22px`, with the space. Check with
  regexes (`scratchpad/bundlecheck.py` style), not exact substrings.
- **The token block is on `.o_web_client` now, on purpose.** The old landmine ("do not lift the `.o_sf`
  token block to `<html>`") was about leaking Strataflow tokens onto stock pages; that is the intent
  today. `holdPageGround` (`core/shell.js:29`) still paints `<html>` with literal hex and still uses
  the *shell's* theme — a light stock page flashes dark for 600 ms after leaving a dark screen.
- **Odoo CE has no dark mode**: `ir.http.color_scheme()` returns `"light"`; `web.assets_web_dark` is
  never served. Stock views are light until that is overridden.
- **Quote grep globs in zsh** — `--include=*.xml` unquoted expands and the flag vanishes; every class
  looked absent. A negative from a grep is only as good as the invocation.
- **The three path declarations must agree** (`path` on the action, `static path` on the component,
  `HOME_URL`), and **a path may never equal a stock client-action tag** (`home` → `desk`). Check with
  `registry.category("actions").add("…")` across `addons/*/static/src`.
- **Never plant a `session_id` cookie on `localhost` with `document.cookie`** — two cookies at two
  Paths split the profile into two sessions. Delete the stray one in DevTools if login "does nothing".
- **"Verified server-side" is not "verified".** Three visual bugs shipped past every HTTP check this
  session and were found in the first browser open. The automation tab boots the web client again
  (the storage exception still logs, harmlessly) — use it before calling anything done.
- **`map.isStyleLoaded()` is not "the style is ready"** — it is false while any tile streams. Guard
  layer/source work on a flag set in the `style.load` handler (`styleReady`), never on that call.
- **The Sass `min()` landmine bit again**: `min(52%, 460px)` broke the whole bundle, and Odoo served
  the *previous* CSS with only a red banner at the bottom of the page. `height: 52%; max-height:
  460px` instead. Grep new SCSS for `min(`/`max(` with mixed units before restarting.
- **maplibre-gl.css loads after our sheet** (lazy `loadCSS`): any rule on a MapLibre-classed element
  needs more than one class of specificity or it loses. Marker elements are positioned by MapLibre
  with an inline transform — style their size and look, never their `position`.
- **Rerun the check after every edit, not after the batch.** Heredoc edits can no-op silently; the Edit
  tool errors instead — prefer it.
- **`post_init_hook` runs on install, never on `-u`**; `data/strataflow_crm_account_data.xml` is
  `noupdate="1"`; `views/strataflow_actions.xml` is not.
- **Action `path` is unique across every action table**; `crm` and `work-orders` are taken by stock.
- **Odoo forbids `@import` between asset files**; shared SCSS is *listed* in every bundle before its
  consumers. Login assets live outside `static/src` so the backend glob never sweeps them in.
- **Do not "smooth" an async swap with `document.startViewTransition`** (reverted `95868cd255a`).
- **The skeleton must not fake chrome that needs no data**; real bar and footer at `z-index: 1000`.
- Odoo 19 renames: `res.groups.privilege_id`, `crm.lead.recurring_plan`, luxon is a global, Sass
  swallows CSS `min()`. Grep the stock model before using a field name from memory.

## Environment / setup
- Read `CLAUDE.md`, `BACKLOG.md`, then `ARCHITECTURE.md`.
- `~/strataflow/.venv` (gitignored). Postgres via Homebrew; DB `strataflow_dev` with demo.
- Run: `.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons --dev=xml --http-port=8069 --log-level=warn`
  plus `-u strataflow_workorder` after any Python/XML/JS/SCSS change (SCSS in the `_assets_*` variable
  bundles too — they are compiled into the same `web.assets_web` bundle). Fresh DB: `dropdb strataflow_dev`,
  then `-i strataflow_workorder --with-demo` (~4 min).
- Strataline dev: `bash ~/map-sys/scripts/app.sh start 8613`; `ir.config_parameter` `strataline.base_url`
  = `http://localhost:8613` (dev) / `https://strataline.co` (default when unset), `strataline.api_key`.
- Scratchpad checks worth re-creating in-repo: `bundlecheck.py` (JSON-RPC login, pull `web.assets_web`
  JS + CSS, count needles, call `get_map_config`) — decisive this session; `logincheck.py` from last.
- Git identity is repo-local `Stefan Djordjevic <dev@authex.co>`; pushes use the `authexinc` login.
  map-sys commits use the same identity via `-c user.name/-c user.email`.

## Open decisions
1. **USP feed transport** — unchanged, `BACKLOG.md` › Open questions.
2. **Stock views in dark** — do it, or accept light stock pages under a dark shell? Scoped in BACKLOG.
3. **Satellite from Esri** — the one third-party call the tenant UI makes (imagery, same as strataline).
   Fine by the fonts rule as written; flagging it since it was not asked.

Locked this session (`ARCHITECTURE.md`): tenant-wide light stock styling; accent primaries; `postal_code`
on the ticket; the map integration shape (key in the browser as `?key=`, nothing copied from map-sys).

Still waiting on Stefan: merges (`feat/search-key-scope` in `~/map-sys`, this branch into `19.0`); a
browser pass over the revamp and the map.
