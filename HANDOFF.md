# Handoff — 2026-09-08 14:55

## Current state
`addons/strataflow_workorder` is the only custom module on this Odoo 19 CE fork. Six fullscreen OWL screens
(Home, Dispatch, Work Orders, CRM, Invoices, Locator) render in the Strataline glass shell, backed by stock
`crm.lead` and `account.move`, with tickets as `mail.thread` records. Maps are still faux SVGs.

This session was **not** feature work: Stefan handed over a list of 17 items and asked for them one by one.
Ten are done, one is done-but-unverified, one was answered and decided, and five are queued. The durable
list now lives in **`BACKLOG.md`** — new this session, because `HANDOFF.md` is overwritten every wrap and a
queue parked in its "Next steps" dies with it. `CLAUDE.md`'s session protocol records the convention.

Nothing is known broken. Four of the fixes were real defects, not polish:
- **Two dead guards in the Locator.** `sel.done` was read by the "Start locate drawing" and "Confirm locate"
  buttons, but `done` is computed in the `stops` getter, which maps *copies*; `sel` returns the raw ticket, so
  both guards read `undefined` and never disabled anything. Replaced by a `selDone` getter, and a finished
  ticket now renders a completed view instead of the drawing tools.
- **Dispatch offered an assignment it could not make.** The button was correctly disabled; the crew rows
  around it were not, so an invoiced ticket let you pick a locator and then promised "Assign to S. Braun"
  behind a permanently grey button.
- **A CSS specificity bug ate the Home greeting's spacing.** `.o_sf_home_h1`'s `margin: 0 0 26px` computed to
  `0` because the reset on `strataflow.scss:80` compiles to `.o_sf h1` — (0,1,1) beats the component class.
- **The primary CTA and the selected nav item were the same pill in both themes.** Both used the `ink-btn`
  mixin. Ink now means navigation; primary actions take the accent.

## What I was doing when this ended
Nothing in flight; working tree clean. I had just asked Stefan three questions, he answered one
(ticket creation) and said to put the rest in the backlog and wrap. **Two questions are still open and are
the first thing to raise next session:** the USP feed hookup, and what Auto-assign should do.

## Repo state
- Branch `feat/strataflow-workorder`, working tree clean, **6 commits ahead of
  `origin/feat/strataflow-workorder` — not yet pushed.** HEAD before this wrap was
  `18f11b73c14 [DOC] strataflow: lock the ticket-creation decision, restructure BACKLOG`.
- This session's commits, oldest first: `9d7377398cc` (BACKLOG.md added), `e4141c08975` (five fixes),
  `92227039d6e` (ink/accent split + motion), `2306d5045a7` (skeleton fade), `a53ab0cf4e3` (ticket-creation
  baseline), `18f11b73c14` (decision locked).
- Not merged into `19.0`. Merge is Stefan's call.
- `~/map-sys` is untouched this session: still on `feat/search-key-scope`, in sync with its origin, still
  carrying that one **unrelated uncommitted edit to `README.md`** (manage_users → manage_access). Left alone
  a third time; either commit it or discard it.
- Still no automated tests for this module.

## Next steps
`BACKLOG.md` is the queue. In the order I would take them:
1. **Push this branch** (6 commits) and get eyes on it.
2. **Answer the two open questions** in `BACKLOG.md` › "Open questions". Auto-assign is blocked on one thing:
   whether real locator GPS is in scope, since `screens/dispatch.js:95` `crewAnchors` infers a locator's
   position from their current ticket rather than a fix.
3. **Verify the skeleton fade in a browser** — see Landmines; it is the one thing shipped unverified.
4. **Add the "+ New ticket" button** (decided, not built). Mirror `screens/crm.js` `newLead` and
   `screens/invoices.js` `newInvoice`; required fields are `address` and `dig_date`; leave `source` at its
   `manual` default.
5. **README** (`BACKLOG.md` › Platform) — the one fully unblocked item that needs no browser.
6. **Odoo-free URLs** and **the internal-screen revamp** — both large; scope before touching. The revamp
   should also settle `.o_sf_btn--primary`, which still uses the ink mixin.
7. Still outstanding from before this session: MapLibre swap (`core/shell.xml` `FauxMap`,
   `screens/workorders.xml` ticket canvas), a stored sort key on `strataflow.workorder`, tests for
   `action_invoice_closed` and `action_complete_locate`, and tenancy Phase 2.

## Landmines
- **The automation tab stopped mounting the web client mid-session, and this is the big one.** Symptom:
  `.o_web_client` present, `document.body.innerHTML` 24 characters, console showing only
  `Error: Access to storage is not allowed from this context`. Odoo's boot needs `localStorage` and the page
  context is denied it. **Earlier in the same session the workaround below worked repeatedly**, then stopped.
  Verified it is *not* our code: stashing the entire skeleton change and restarting reproduced the identical
  failure. Retry the recipe, but budget for it failing and fall back to JSON-RPC.
- **The workaround that did work for most of the session:** navigate to `/web/login` first (this primes
  storage for the origin), inject a `session_id` cookie obtained over JSON-RPC via
  `document.cookie = "session_id=…; path=/; SameSite=Lax"`, then navigate to the action route. Note the probe
  is misleading — `localStorage` from the extension's injected context reports `ok` while the *page's own*
  context is still denied, so a passing probe does not mean Odoo will boot.
- **First screenshot after any navigation comes back blank** even when the DOM is fully painted. One scroll
  tick or a second capture fixes it. Probe the DOM before believing a blank screenshot.
- **`post_init_hook` runs on install, never on `-u`.** And `data/strataflow_crm_account_data.xml` is
  `noupdate="1"`, so a data-record override applies on a fresh install and silently does nothing on update.
  Changing anything already present in a tenant database needs a migration script.
- **Zero-specificity resets:** `strataflow.scss` wraps its element resets in `:where()` *on purpose* (see the
  comment above them) so single-class component rules win. `h1` had been left out, which silently killed the
  Home greeting's margin and `.o_sf_kv`'s `margin-top` on three `<dl>`s. If a component margin looks ignored,
  check that reset first.
- **OWL branch chains:** lifting a block out of a `t-if`/`t-elif` chain and re-inserting it creates a *second*
  independent group, so two branches render at once. The Locator's stage chain must stay one chain
  (`t-if` selDone → `t-elif` map → `t-elif` draw → `t-else` review).
- **ReportLab writes `/Filter [/ASCII85Decode /FlateDecode]`.** Raw `zlib.decompress` over the PDF streams
  yields nothing and will happily "prove" whatever you hoped — an empty extraction made a removed string look
  absent. Use a real parser (`PyPDF2` is in the venv).
- `--log-level=warn` suppresses the "Modules loaded" line, so an `until grep` wait on it never returns. Poll
  HTTP instead.
- Public Sans sets ~6.5% wider than the system stack it replaced. Fixed-width panels truncate sooner. Still
  **analysis, not observation**.
- A strataline key must pass as `?key=` from the browser; a cross-origin `X-Api-Key` header needs a CORS
  preflight `serve.py` does not answer. Server-side the header is fine.
- Search results are clipped to the key's bbox, so a wrong bbox gives an empty search, not an error.
- `--with-demo` also installs crm/account demo data (Acme Corporation etc.); stat numbers include it.
- Odoo 19 renames: `res.groups.privilege_id`, `crm.lead.recurring_plan`, luxon is a global, Sass swallows CSS
  `min()`. Grep the stock model before using a field name from memory.
- `get_board_data` (`models/strataflow_workorder.py:166`) returns every ticket; needs a domain/limit before
  real volumes.

## Environment / setup
- Read `CLAUDE.md` (protocol), `BACKLOG.md` (the queue), then `ARCHITECTURE.md` (locked decisions).
- `~/strataflow/.venv` (gitignored). Postgres via Homebrew; DB `strataflow_dev` with demo.
- Run: `.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons --dev=xml --http-port=8069 --log-level=warn`
  plus `-u strataflow_workorder` after any Python/XML/JS/SCSS change — **SCSS changes need the restart**, a
  plain reload serves a stale bundle. Fresh DB: `dropdb strataflow_dev`, then the same command with
  `-i strataflow_workorder --with-demo` (~4 min). A server may still be running on 8069 from this session.
- Verifying without a browser: `POST /web/session/authenticate` (admin/admin on the dev DB) and drive
  `call_kw` from a small script. The agent does not type passwords into the browser.
- Screens at `/odoo/action-strataflow_workorder.action_strataflow_<home|dispatch|workorders|crm|invoices|locator>`.
- Git identity is repo-local `Stefan Djordjevic <dev@authex.co>`; pushes use the `authexinc` GitHub login.

## Open decisions
Two, both in `BACKLOG.md` › "Open questions", both needed before the dependent work can be planned:
1. **How do we hook into the USP feed?** Transport, record shape, auth, cadence, and whether it lands in Odoo
   directly or through the strataline API. Until it exists, `source` is always `manual`.
2. **What should "Auto-assign" actually do?** The options put to Stefan, verbatim in the backlog: keep the
   current-ticket approximation; add real locator GPS (needs a position source, a field, and a staff-tracking
   privacy call); assign by workload or zone/skill instead of distance; or leave it stubbed.

Answered this session and now locked in `ARCHITECTURE.md`: **tickets get a "+ New ticket" button in the
shell**, matching CRM and Invoices.

Also still waiting on him from before: the two merges (`feat/search-key-scope` in `~/map-sys`, and this
branch into `19.0`).
