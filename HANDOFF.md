# Handoff — 2026-09-09 (night)

## Start here: the stock-view sweep is two commits in, and the stock navbar is now the app's

Everything below was **seen in the automation tab** (auth recipe under Landmines), not just
checked over HTTP. Four commits this session, all on `feat/strataflow-workorder`, pushed:

1. `8c4fe820d7f` — brief `tasks/03-stock-view-sweep.md` **step 1**: the six dead declarations in
   `static/src/stock/stock.scss` (toast rescoped to `.o_notification_manager .o_notification`,
   kanban block on `.o_kanban_renderer` with the `--Kanban*` variables, list `thead` via
   `--ListRenderer-thead-*`, separator `!important`, statusbar `var(--bg)`).
2. `da725915429` — **step 2**: `$nav-tabs-link-active-bg`, `$dropdown-link-hover-bg`,
   `$table-striped-bg-factor`, `$table-hover-bg-factor` in `static/scss/backend_bootstrap.scss`.
   The notebook's white-on-off-white seam is closed by this alone.
3. `4fd32387e1c` — **off-brief, Stefan's call mid-session**: the stock navbar is rebuilt as the
   shell's top bar. `static/src/stock/navbar.xml` replaces `web.NavBar`'s template (brand pill, nav
   pills from the shell's `NAV`, `.o_navbar_breadcrumbs` kept, systray filtered to the user menu);
   `navbar.js` patches `NavBar` (lit pill from the controller's `res_model`, `pending` on click,
   `sfGoNav`) and `UserMenu` (initials); `user_menu.xml` makes the toggler the round disc.
   `$o-navbar-height: 72px`, bar transparent, pills carry the glass.
4. `0fcaae22b48` — Preferences dialog flat sheet (brief step 6's dialog rule, early), avatars as
   gradient discs (chatter, many2one widgets, contact image), Help / Support / My Odoo.com Account
   removed from `user_menuitems`, initials centred in the disc.

**Steps 3–7 of the brief are not done.** `BACKLOG.md` › UI › "Stock-view sweep, steps 3–7" lists
exactly what remains; the brief's Plan, Acceptance criteria and Verification sections still apply
as written. Next thing to type is step 3 (the statusbar's five `--o-statusbar-*` variables).

## Current state
`addons/strataflow_workorder` on Odoo 19 CE. Six fullscreen OWL screens at `/odoo/desk`,
`/odoo/dispatch`, `/odoo/workorders`, `/odoo/pipeline`, `/odoo/invoices`, `/odoo/locator`; `/` →
`/odoo/desk`; `/odoo` reaches the stock backend, restyled — and since tonight every stock page
carries the same brand pill, nav pills and avatar disc as the six screens, so leaving a screen for
an invoice, a lead or the ticket form no longer changes chrome. Map stack unchanged from the
previous handoff (`static/src/core/strataline_map.js`, `layers.js`, `layer_panel.js`,
`locate_geo.js`, `locate_canvas.js`; strataline over its API with the tenant's key).

Stock-view files, all under `addons/strataflow_workorder/static/`:
- `scss/backend_variables.scss` — prepended to `web._assets_primary_variables`; palette, radii,
  navbar metrics (`$o-navbar-height: 72px`, ground and border zero).
- `scss/backend_bootstrap.scss` — prepended to `web._assets_backend_helpers`; literals only.
- `src/stock/stock.scss` — the material: navbar layout + button reset, control panel, buttons,
  dropdowns, modal, dialog-sheet rule, gradient avatars, toast, form, list, kanban, settings.
- `src/stock/navbar.js`, `navbar.xml`, `user_menu.xml` — the bar and the user menu.

## What I was doing when this ended
Stefan said "commit, push, and /wrap" after the Preferences fixes. Tree clean, pushed, nothing in
flight. The automation tab (`localhost:8069`, tab in the MCP group) is authenticated and sitting on
`/odoo/invoices/account.move/71`; the dev server is up with `-u` applied.

## Repo state
- Branch `feat/strataflow-workorder` at `0fcaae22b48`, **up to date with origin** (pushed
  `94f1a898537..0fcaae22b48`). Not merged into `19.0` — Stefan's call. Only `scratchpad/` is
  untracked (dev logs; still not in `.gitignore`, see Landmines).
- `~/map-sys` untouched this session (still `feat/search-key-scope` at `4b08efb`, 5 unpushed).
- Dev servers: Odoo on 8069 (`scratchpad/odoo.log`, `--log-level=warn`); strataline was **not**
  started this session, so Dispatch shows the skeleton ground rather than tiles.
- Still no automated tests for this module.

## Next steps
1. **Step 3 of the brief** — statusbar arrows. One rule inside `.o_form_view` in `stock.scss`:
   `.o_field_statusbar > .o_statusbar_status { --o-statusbar-radius: 10px; --o-statusbar-border:
   var(--bg); --o-statusbar-background-hover: var(--chip-bg); --o-statusbar-background-active:
   var(--accent-soft); --o-statusbar-border-active: var(--accent); > .o_arrow_button { font-weight:
   600; } }`. `--o-statusbar-border` must equal what `.o_form_statusbar` paints (`var(--bg)` since
   step 1) or the arrow outlines halo. Check on a `crm.lead` and an invoice.
2. **Steps 4–7** in order, each restarted with `-u` and looked at. The searchview caret's square
   corner (step 4) is visible on every list right now and is the cheapest win.
3. **BACKLOG › "Stock navbar follow-ups"**: phone width, theme toggle once dark stock views exist.
4. Unchanged from before: zone-first auto-assign, layer-panel follow-ups, USP feed, README, and
   Stefan's pushes/merges (`feat/search-key-scope` in map-sys is what makes the map work against
   strataline.co).

## Landmines
- **Auth for the automation tab, current recipe.** Mint a session over JSON-RPC against
  `localhost` (`curl -c /tmp/sfc3.txt … /web/session/authenticate`), navigate the tab to
  `http://localhost:8069/web/static/img/favicon.ico` (static → no cookie of its own), run
  `document.cookie = "session_id=<value>; path=/; SameSite=Lax"`, then navigate to the page. **Not
  `127.0.0.1` any more** — its httponly cookie got planted by a login redirect this session and
  `document.cookie` cannot replace it. **Auto mode blocks the plant**: `[BLOCKED: Cookie/query
  string data]`; Stefan has to shift+tab out first. The classifier also blocked one JS call with no
  cookie in it, so a block is not proof the call was wrong.
- **First load after a `-u` restart usually fails to boot** (`Access to storage is not allowed from
  this context.`); navigate again and wait 7–10 s. Once it took three tries and ~40 s. While it is
  failing, `odoo.__WOWL_DEBUG__` is undefined and a JS probe sees an empty body even when a
  screenshot shows the bar — trust `document.title` changing to the record name.
- **`--` inside an XML template comment kills the whole template bundle.** Browser: `OwlError:
  Missing template: "web.WebClient"`. Cause only in `scratchpad/odoo.log`: `Invalid XML template:
  Comment must not contain '--'`. Check the log before touching anything else.
- **The shell's button reset does not reach stock pages.** `.o_sf :where(button)` is scoped; anything
  of ours rendered outside `.o_sf` (the navbar) needs the same reset or renders as a UA button.
  `stock.scss` scopes a copy to `.o_main_navbar`.
- **Stock's navbar entry rules beat one-class rules.** Height strip, `display: flex`, 72px
  line-height, `background` on `.dropdown-toggle` — pin at three classes
  (`.o_main_navbar .o_user_menu > .dropdown-toggle`).
- **`object-position` percentages are relative to (box − image).** For a 128px avatar in a 130px box
  that is 2px; use lengths. `object-fit-cover` and the other `object-fit-*` utilities are
  `!important`.
- **`user_menuitems` removals live in `navbar.js`** (`documentation`, `support`, `odoo_account`).
  If Odoo adds another odoo.com entry, that is the place.
- Still true from earlier handoffs: Sass eats `min()`/`max()` with mixed units and Odoo serves the
  *previous* CSS with only a red banner; prepend (never append) in the `_assets_*` variable bundles;
  `backend_bootstrap.scss` may not name Bootstrap variables; Bootstrap utilities are `!important`;
  Odoo's compiled CSS is not whitespace-minified (verify with regexes); quote grep globs in zsh
  (`--include='*.scss'`, unquoted it silently vanishes — bit again tonight); Odoo CE has no dark
  mode; `holdPageGround` flashes a light stock page dark once after a dark screen; a `path` may never
  equal a stock client-action tag; `post_init_hook` runs on install only; never `document.cookie` a
  `session_id` onto an origin that already has one.
- `scratchpad/` is untracked and **not in `.gitignore`** — one `git add -A` away from committing
  `odoo.log`.

## Environment / setup
- Read `CLAUDE.md`, `BACKLOG.md`, then `ARCHITECTURE.md`; the brief for the current work is
  `tasks/03-stock-view-sweep.md` — read it whole, every citation in it was verified against the
  merged 19.0 tree this session and held.
- `~/strataflow/.venv`. Postgres via Homebrew; DB `strataflow_dev` with demo.
- Run: `.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons
  --dev=xml --http-port=8069 --log-level=warn -u strataflow_workorder` after any SCSS/XML/JS
  change (`--dev=xml` does not rebuild SCSS). `scratchpad/csscheck.sh` logs in over JSON-RPC and
  pulls the compiled `web.assets_web.min.css` to `/tmp/sf_backend.css` for the brief's greps.
- Strataline dev, if the map is needed: `bash ~/map-sys/scripts/app.sh start 8613`; keys unchanged
  (`strataline.base_url` = `http://localhost:8613`, `strataline.api_key` in `ir_config_parameter`).
- Git identity is repo-local `Stefan Djordjevic <dev@authex.co>`.

## Open decisions
1. **Initials on the image avatars?** Today they are plain gradient discs (CSS cannot read the
   name). Letters mean a small avatar widget or a patch of `o-mail-Avatar`. Stefan asked for "just a
   gradient circle", so the default is no.
2. **Theme toggle on stock pages** — omitted on purpose until "Stock views, dark" (BACKLOG) exists.
3. Unchanged: USP feed transport; layer choices per device or per user; Satellite from Esri.

Locked earlier (`ARCHITECTURE.md`): tenant-wide light stock styling; accent primaries; the map
integration; geo-referenced drawings. Nothing new was locked tonight; the navbar rebuild is a
build decision under the existing "Strataline language, tenant-wide" row.
