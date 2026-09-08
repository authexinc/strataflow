# Strataflow — devlog

Newest first. Read the last 3–5 entries at session start. Failures are recorded on purpose; a
workaround is labelled as one so it does not become permanent by accident.

### 2026-09-08 — Phase 0 on strataline: API keys can search, scoped to their bbox

**Goal:** HANDOFF next step 1 — let a strataflow tenant's key reach strataline's
`/search/address|features|lld`, not just `/tiles/*`, and let a provisioner mint keys in-process.
All the code is in `~/map-sys`; nothing in this repo changed except these docs.

**What was built** (map-sys branch `feat/search-key-scope`, commits 7e466cf + 1b16818, **not pushed**
because pushing `main` there deploys to prod):
- `"search"` is a grantable pseudo-source in a key record. With it the three search endpoints answer
  a key; without it they stay 403. It is never treated as a tile source, so granting search cannot
  widen tile access.
- Search results are restricted to the key's bbox, and `daily_searches` is a counter separate from
  `daily_tiles`.
- `scripts/manage_access.py` exposes `create_key(org, contact, bbox, sources=..., origins=...,
  keys_file=...) -> (record, raw)` for the Phase 2 provisioner to import. The raw secret exists only
  in that return value.
- Browser callers get CORS on search responses for origins registered on the key, and must pass the
  key as `?key=` (a custom header would need a preflight the server does not answer).

**Failures worth recording:**
1. The first cut clipped results to the bbox *after* the query, over-fetching 4x to compensate.
   Against the real province indexes `"17 avenue"` returned 32 rows and **0** inside Calgary — a
   city-scoped tenant key would have looked broken on its own city. FTS ranks the whole province
   before applying the limit, so over-fetching cannot fix it. The bbox now goes into the SQL.
2. With the bbox in the WHERE clause, SQLite scans the entire ranked match set: `"road"` against a
   small box took 375 ms. Scoped queries now rank at most 4000 rows in a subquery, then filter —
   105 ms, same rows returned. Unscoped session queries keep the old one-shot SQL.
3. Queries under three characters were being charged against the daily quota. Type-ahead fires per
   keystroke, so the first two letters of every search were spending budget. They now answer empty
   before the counter.

**What this unblocks:** step 2 (swap the faux maps for MapLibre) and the Phase 2 provisioner, but
only after Stefan merges the branch — until then production keys still reach `/tiles/*` only, so the
Locator would get 403 from `/search/*`.

**Files touched (this repo):** `ARCHITECTURE.md`, `HANDOFF.md`, `DEVLOG.md`.

### 2026-09-08 — Six screens on real Odoo modules (crm, account, mail) + theme fade
**Goal:** Implement Home, Dispatch, CRM, Invoices and Locator from the Claude Design project; move CRM/invoicing
off stand-in models onto `crm.lead` / `account.move`; connect tickets to leads, invoices and partners; add a smooth
theme fade; on Work Orders replace Print with an Export menu and fix the primary button hover/expanded states.

**Approaches tried:**
1. Light stand-in models `strataflow.lead` / `strataflow.invoice` — written, then discarded when the brief changed
   to real modules. Not a failure of the code; a scope correction. Deleted before the first install.
2. Install with `res.groups.category_id` → `Invalid field 'category_id' in 'res.groups'`. Odoo 19 moved it to
   `privilege_id` → `res.groups.privilege` (which carries `category_id`).
3. Install with form view referencing `invoice_id` after the model field was renamed to `move_id` →
   `Field "invoice_id" does not exist in model "strataflow.workorder"`. The waiter reported "UP" because the server
   serves without the module; waiter now greps for view/model errors before declaring success.
4. Demo `crm.lead` with `recurring_plan_id` → `Invalid field 'recurring_plan_id' in 'crm.lead'`. Field is
   `recurring_plan` in 19 (the earlier grep only confirmed `recurring_revenue`).
5. SCSS `width: min(1020px, calc(100% - 48px))` → whole backend CSS bundle failed:
   `"calc(100% - 48px)" is not a number for 'min'`. Odoo's Sass resolves `min()` as the Sass function.
   Replaced with `width: calc(100% - 48px); max-width: 1020px`.
6. Theme toggle appeared dead: `toggleTheme()` ran (localStorage flipped) but `data-theme` never changed.
   Suspected OWL reactivity through a getter object; rewrote to plain `useState(store)` — still dead. Actual cause:
   a stale asset bundle containing both old and new `theme.js` (`get isDark` still present after the file was
   rewritten). Restarting with `-u strataflow_workorder` regenerated assets; the fade then measured
   195→101→50→27→20 over ~450 ms. The `useState(store)` rewrite was kept (simpler), but it was not the fix.
7. First-load screenshots of every screen came back blank while the DOM was complete; `elementFromPoint`
   returned the header. Screenshot timing on the first composite of the backdrop-filter layers, not a bug.
   One genuine stall (Home skeleton stuck once, unreproduced) is fenced by a 4 s skeleton timeout in the shell.

**What worked:** real-module wiring — `crm.lead` One2many/smart button + `get_pipeline`; `account.move`
`get_invoice_board` + `action_invoice_closed` (one draft invoice per requester, line per ticket, product
"Locate service"); `mail.thread` on tickets with tracking; `res.partner` smart button. Shared `StrataflowShell`
with slots and a generic skeleton; `theme.js` store with `.is-theming` transitions; Export menu via Odoo
`Dropdown` (PDF from a reportlab controller, PNG rasterised client-side, CSV). Verified live in Chrome across all six
screens; the user ran close→invoice in their own tab and a real draft `INV` appeared for the ticket.

**Workarounds (labelled):**
- Faux-map SVGs stand in for Strataline tiles; containers are shaped for MapLibre. Proper fix: Phase 0 on strataline
  (`/search/*` key scope in `serve.py`, programmatic key minting) then the tenant key from provisioning.
- Dispatch distances derive from each locator's current on-site/assigned ticket, not GPS.
- The skeleton 4 s timeout hides an unreproduced stall rather than explaining it.
- Browser verification signed in by transplanting a curl-authenticated `session_id` cookie on a more specific path
  (`/odoo`), because the HttpOnly root cookie cannot be overwritten and passwords are not typed by the agent.
  Dev-only.

**Files touched:** `addons/strataflow_workorder/models/{strataflow_workorder,crm_lead,account_move,res_partner}.py`,
`controllers/export.py`, `security/*`, `data/strataflow_crm_account_data.xml`, `demo/*.xml`,
`views/strataflow_actions.xml`, `static/src/core/*`, `static/src/screens/*`, `static/src/strataflow.scss`.

**Open questions:** Should "Confirm & close" in Locator set `closed` directly or stop at `located` for dispatcher
review? Rename stock CRM stages to the design's ("Quote sent")? Per-tenant invoice numbering vs Odoo's? Dispatch pins
are 26 px at rest (desktop floor is 28 px).

### 2026-09-08 — Work Orders screen in the Strataline glass shell
**Goal:** Port `Strataflow Work Orders.dc.html` (Claude Design) into the Odoo 19 fork as a fullscreen OWL client
action, reusing strataline's tokens and skeleton loader, with an apple-design review folded into the port.

**Approaches tried:**
1. Security XML with `res.groups.category_id` → install failed (see entry above; first hit here).
2. `import { DateTime } from "luxon"` → the JS module silently failed to load; symptom was
   `Cannot find key "strataflow_workorders" in the "actions" registry`. Odoo exposes luxon as a global:
   `const { DateTime } = luxon;`.
3. Reset `.o_sf button { padding: 0; border: 0 }` outranked single-class rules (`.o_sf_chip`, `.o_sf_btn`),
   collapsing every button. Replaced with a zero-specificity `:where(button)` reset.
4. System `python3` lacked Odoo deps (`No module named 'babel'`); created `.venv` from `requirements.txt`
   (gitignored along with `graphify-out/`).

**What worked:** `strataflow.workorder` + `strataflow.utility` models, Locator/Dispatcher groups, client action with
`static target = "fullscreen"`, `usePopover` for Assign locator (Escape/outside/focus-return from the service),
pointer-event drawing canvas with metre labels prefixed by the utility letter, skeleton shell dismissed on first paint,
prefers-reduced-motion/transparency fallbacks. Assign and drawing persistence verified over RPC.

**Workaround (labelled):** list order was plain `dig_date` ascending, which floated invoiced tickets to the top;
sorted client-side (open → located → closed/invoiced) rather than in `_order`. Proper fix is a stored sort key.

**Files touched:** `addons/strataflow_workorder/` (17 files), `.gitignore`.

**Open questions:** ship Public Sans / JetBrains Mono as local `@font-face` or keep the system stack?
