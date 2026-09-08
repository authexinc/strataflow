# Handoff — 2026-09-08 12:51

## Current state
`addons/strataflow_workorder` is the only custom module on this Odoo 19 CE fork. Six fullscreen OWL screens
(Home, Dispatch, Work Orders, CRM, Invoices, Locator) render in the Strataline glass shell and were verified live in
Chrome, dark and light, with no app console errors. CRM and Invoices are backed by stock `crm.lead` and
`account.move`; tickets are `mail.thread` records linked to leads, invoices and partners with smart buttons. Maps are
faux SVGs in MapLibre-shaped containers — live Strataline tiles are not wired. Nothing is known broken.

## What I was doing when this ended
Session closed after writing DEVLOG.md. No task in flight. Last code change: Locator header dig date formatted
(`screens/locator.xml`, commit `dbeccaab3a5`).

## Repo state
- Branch `feat/strataflow-workorder`, clean; pushed to `origin/feat/strataflow-workorder`. HEAD `bf4b8325d8d [DOC] strataflow_workorder: add DEVLOG with the two build entries`.
- Not merged into `19.0` (the fork's mainline). Merge is Stefan's call.
- Nothing intentionally broken. Build: module installs clean from scratch with demo; no automated tests exist
  for the module (Odoo test suite not run).

## Next steps
1. Strataline Phase 0 — in `~/map-sys/web/serve.py:1390` the API-key gate returns 403 for anything but
   `/tiles/*`; add `search` as a grantable source so `/search/address|features|lld` accept `X-Api-Key`.
   Then make `scripts/manage_access.py` `cmd_key_create` importable for a provisioner.
2. Swap the faux maps for MapLibre: Dispatch/Locator full-bleed map is `core/shell.xml:118`
   (`FauxMap`), the ticket canvas basemap is `screens/workorders.xml:141`; pins already project through
   `core/geo.js` — replace `project()` with `map.project()` when tiles land.
3. Dispatch pins are 26 px at rest — bump `.o_sf_pin` (`static/src/strataflow.scss:221`) to 28 px to meet
   the desktop target floor.
4. Add a stored sort key on `strataflow.workorder` so list order is server-side (client sort is a labelled
   workaround, DEVLOG 2026-09-08 "Work Orders screen").
5. Add `tests/` for `action_invoice_closed` (`models/strataflow_workorder.py:84`) and
   `action_complete_locate` (`:120`) — one `TransactionCase` each.
6. Tenancy Phase 2 (DB-per-tenant provisioner, `dbfilter=^%d$`) — design is in memory
   `strataflow-tenancy-decisions`; nothing built yet.

## Landmines
- After editing JS under `static/src`, a plain reload can serve a stale bundle mixing old and new module copies
  (looked like broken OWL reactivity). Restart with `-u strataflow_workorder`. DEVLOG 2026-09-08 item 6.
- `--with-demo` also installs crm/account demo data (Acme Corporation etc.) alongside ours — stat numbers on a demo
  DB include it.
- Odoo 19 renames hit this session: `res.groups.privilege_id` (not `category_id`), `crm.lead.recurring_plan`
  (not `_id`), luxon is a global (`const { DateTime } = luxon`), Sass swallows CSS `min()`. Grep the stock
  model before using a field name from memory.
- Every screen's `load()` runs from `onMounted` via the protected ORM; the shell hides the skeleton after 4 s
  regardless (`core/shell.js:43`) — a fence, not a fix.
- `get_board_data` (`models/strataflow_workorder.py:166`) returns every ticket; fine for demo, needs
  a domain/limit before real volumes.
- Dispatch distances come from each locator's current ticket (`screens/dispatch.js:95` `crewAnchors`),
  not GPS; `planRoutes` (`core/geo.js:45`) is greedy nearest-neighbour, presented as a suggestion.
- Chrome tool coordinates are viewport pixels (1728 wide) while screenshots are 1542 wide — click by `find` refs.
  First-paint screenshots of the blurred panels come back blank; probe the DOM.

## Environment / setup
- `~/strataflow/.venv` (gitignored). Postgres via Homebrew; DB `strataflow_dev` with demo.
- Run: `.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons --dev=xml --http-port=8069 --log-level=warn`
  (add `-u strataflow_workorder` after Python/XML/JS changes). Fresh DB: `dropdb strataflow_dev`, then the same
  command with `-i strataflow_workorder --with-demo` (~4 min).
- Login `admin` / `admin`. Screens at `/odoo/action-strataflow_workorder.action_strataflow_<home|dispatch|workorders|crm|invoices|locator>`.
- PDF export needs `reportlab` (bundled with Odoo deps); wkhtmltopdf is not installed and not needed.
- Git identity for this repo is set locally to `Stefan Djordjevic <dev@authex.co>`; pushes use the `authexinc`
  GitHub login in the keychain.

## Open decisions
1. **Locator "Confirm & close"** — currently sets status `closed` directly (`action_complete_locate`,
   `models/strataflow_workorder.py:120`). Keep that, or stop at `located` so a dispatcher closes after
   review (Work Orders "Close ticket" already exists for that path)?
2. **CRM stage names** — the CRM screen shows Odoo's stock stages (New / Qualified / Proposition / Won). Rename
   "Proposition" → "Quote sent" in CRM › Configuration to match the design, or keep stock?
3. **Invoice numbering** — Odoo's `INV/2026/00001` vs the design's `INV-26-0341`. Change the sequence in
   Accounting, or accept Odoo's?
4. **Locate pricing** — `$250` per ticket via product "Locate service" (`data/strataflow_crm_account_data.xml`).
   Flat per ticket, or per utility / per hour?
5. **Fonts** — Public Sans / JetBrains Mono as local `@font-face` (exact design type, adds ~400 KB) or keep the
   system stack (current)?
6. **Equipment / Timesheets / Reports** — leave as "coming soon", or wire `maintenance` and `hr_timesheet` (CE)
   now?
