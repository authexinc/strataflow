# Handoff — 2026-09-08 14:20

## Current state
`addons/strataflow_workorder` is the only custom module on this Odoo 19 CE fork. Six fullscreen OWL screens
(Home, Dispatch, Work Orders, CRM, Invoices, Locator) render in the Strataline glass shell. CRM and Invoices are
backed by stock `crm.lead` and `account.move`; tickets are `mail.thread` records linked to leads, invoices and
partners with smart buttons. Maps are still faux SVGs in MapLibre-shaped containers.

Since the last handoff: strataline Phase 0 is built and pushed, and all six product decisions are answered,
implemented and locked in `ARCHITECTURE.md` under "Product decisions". Concretely that means the locator's
field confirmation now stops at `located` (a dispatcher closes, because closing is what bills), the CRM pipeline
reads "Quote sent", and Public Sans / JetBrains Mono are self-hosted. Nothing is known broken.

## What I was doing when this ended
Nothing in flight. The session ran two units of work, both committed, both pushed, neither merged:
- **strataline Phase 0** in `~/map-sys`, branch `feat/search-key-scope` (`7e466cf` code, `1b16818` docs),
  pushed to `origin/feat/search-key-scope`. 123 tests green. **It is not on prod** — that repo deploys by
  pushing `main`, so merging is Stefan's call, and until it merges a tenant key still gets 403 from `/search/*`.
- **the six decisions** here, `e1783ca9730` + `a32d7f99028`.

## Repo state
- Branch `feat/strataflow-workorder`, working tree clean, in sync with `origin/feat/strataflow-workorder`.
  HEAD `a32d7f99028 [DOC] strataflow: handoff repo state after the decision work`.
- Not merged into `19.0` (the fork's mainline). Merge is Stefan's call.
- `~/map-sys` is on `feat/search-key-scope`, in sync with its origin, with one **unrelated uncommitted edit to
  `README.md`** left over from the hardening session (manage_users → manage_access doc cleanup). Left alone twice
  now; either commit it or discard it.
- No automated tests exist for this module (Odoo's test suite has never been run against it). The strataline
  side does have tests: `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python3 -m pytest tests/ --ignore=tests/test_descent.py`
  (that one module needs `mercantile`, absent from this environment — a pre-existing gap, not something I broke).

## Next steps
`BACKLOG.md` holds the durable queue (17 items added 2026-09-08: strataline login/skeleton styling, an Odoo-free
URL structure, the internal-screen restyle, several Home/Dispatch fixes, and three open questions — the USP
feed hookup, how tickets are created, and what "Auto-assign" should actually do). The list below is only what
this session left at the front of it.

1. **Review and merge `~/map-sys` `feat/search-key-scope`.** It gates step 2 and the Phase 2 provisioner.
   Merging deploys, so read it first: it changes the request gate in `web/serve.py`.
2. Swap the faux maps for MapLibre: Dispatch/Locator full-bleed map is `core/shell.xml:118` (`FauxMap`), the
   ticket canvas basemap is `screens/workorders.xml:141`; pins already project through `core/geo.js` — replace
   `project()` with `map.project()` when tiles land. Search is wired on the strataline side once step 1 is live.
3. Look at the six screens in a browser. The font change made text ~6.5% wider and that has **not** been seen
   rendered (see Landmines). Check the Dispatch queue (`.o_sf_queue`, 328 px) and route (`.o_sf_route`, 316 px)
   panels for early truncation. While there, bump `.o_sf_pin` (`static/src/strataflow.scss:221`) from 26 px to
   28 px for the desktop target floor, and reconsider the 8.5 px crew badge (`:245`) and the -.025em tracking on
   the 38 px hero figure — both were tuned for the old system font.
4. Add a stored sort key on `strataflow.workorder` so list order is server-side (client sort is a labelled
   workaround, DEVLOG 2026-09-08 "Work Orders screen").
5. Add `tests/` for `action_invoice_closed` (`models/strataflow_workorder.py:84`) and `action_complete_locate`
   (`:120`) — one `TransactionCase` each. The second one changed this session and is now the interesting case:
   it must land on `located` with `closed_at` unset.
6. Tenancy Phase 2 (DB-per-tenant provisioner, `dbfilter=^%d$`) — design in `ARCHITECTURE.md`; nothing built.
   Key minting is now one import: `from manage_access import create_key` (in `~/map-sys/scripts/`), which
   returns `(record, raw_secret)` and prints nothing.

## Landmines
- After editing JS under `static/src`, a plain reload can serve a stale bundle mixing old and new module copies
  (looked like broken OWL reactivity). Restart with `-u strataflow_workorder`. DEVLOG 2026-09-08 item 6.
- **`post_init_hook` runs on install, never on `-u`.** And a data record cannot rename something that already
  exists: `data/strataflow_crm_account_data.xml` is `noupdate="1"`, so an override there applies on a fresh
  install and silently does nothing on an update. Changing anything already present in a tenant database needs
  a migration script. This cost a wrong first attempt at the CRM stage rename.
- Public Sans sets ~6.5% wider than the system stack it replaced (measured: `n` advance 0.561 em vs 0.527,
  x-height +1.8%, cap +2.6%). Fixed-width panels truncate sooner. **Analysis, not observation** — see step 3.
- The web client would not mount in the automation tab this session: `.o_web_client` present, body with zero
  children, on both the action route and plain `/odoo`, while `/web/session/get_session_info` from inside the
  page returned uid 2. Same shape as the earlier action-357 note. Verification went over JSON-RPC instead.
- Chrome tool coordinates are viewport pixels (1728 wide) while screenshots are 1542 wide — click by `find` refs.
  First-paint screenshots of the blurred panels come back blank; probe the DOM.
- A strataline key must pass as `?key=` from the browser: a cross-origin `X-Api-Key` header needs a CORS
  preflight `serve.py` does not answer. Server-side (Odoo Python) the header is fine.
- Search results are clipped to the key's bbox, so a tenant with a wrong bbox sees an empty search, not an
  error. Mint the bbox from the real business operation area.
- `--with-demo` also installs crm/account demo data (Acme Corporation etc.) alongside ours — stat numbers on a
  demo DB include it.
- Odoo 19 renames: `res.groups.privilege_id` (not `category_id`), `crm.lead.recurring_plan` (not `_id`), luxon
  is a global (`const { DateTime } = luxon`), Sass swallows CSS `min()`. Grep the stock model before using a
  field name from memory.
- Every screen's `load()` runs from `onMounted` via the protected ORM; the shell hides the skeleton after 4 s
  regardless (`core/shell.js:43`) — a fence, not a fix.
- `get_board_data` (`models/strataflow_workorder.py:166`) returns every ticket; fine for demo, needs a
  domain/limit before real volumes.
- Dispatch distances come from each locator's current ticket (`screens/dispatch.js:95` `crewAnchors`), not GPS;
  `planRoutes` (`core/geo.js:45`) is greedy nearest-neighbour, presented as a suggestion.

## Environment / setup
- Read `CLAUDE.md` (session protocol) and `ARCHITECTURE.md` (locked tenancy + product decisions), both in the root.
- A dev server may still be running from this session on port 8069 (`strataflow_dev`, module updated). Assume it
  is gone and start it with the command below; sessions are invalidated by restarts.
- Reading the Claude Design project again needs `/design-login` (DesignSync auth is per session).
- `~/strataflow/.venv` (gitignored). Postgres via Homebrew; DB `strataflow_dev` with demo.
- Run: `.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons --dev=xml --http-port=8069 --log-level=warn`
  (add `-u strataflow_workorder` after Python/XML/JS changes). Fresh DB: `dropdb strataflow_dev`, then the same
  command with `-i strataflow_workorder --with-demo` (~4 min).
- Verifying without a browser: authenticate over JSON-RPC (`POST /web/session/authenticate`, admin/admin on the
  dev DB) and drive `call_kw` from a small Python script. That is how the locate → close → invoice path was
  checked this session. The agent does not type passwords into the browser.
- Login `admin` / `admin`. Screens at `/odoo/action-strataflow_workorder.action_strataflow_<home|dispatch|workorders|crm|invoices|locator>`.
- PDF export needs `reportlab` (bundled with Odoo deps); wkhtmltopdf is not installed and not needed.
- Git identity for this repo is set locally to `Stefan Djordjevic <dev@authex.co>`; pushes use the `authexinc`
  GitHub login in the keychain.

## Open decisions
**None.** All six were answered by Stefan on 2026-09-08 and are recorded with their rationale in
`ARCHITECTURE.md` › "Product decisions": locate confirmation stops at `located`; CRM stage renamed to
"Quote sent"; Odoo's invoice numbering kept; pricing flat per ticket; fonts shipped locally; Equipment /
Timesheets / Reports stay "coming soon". Do not reopen these without Stefan.

Nothing is currently blocked on him except the two merges (`feat/search-key-scope` in `~/map-sys`, and this
branch into `19.0`).
