# Handoff — 2026-09-08 (evening)

## Current state
`addons/strataflow_workorder` is the only custom module on this Odoo 19 CE fork. Six fullscreen OWL screens
(Home, Dispatch, Work Orders, CRM, Invoices, Locator) render in the Strataline glass shell, backed by stock
`crm.lead` and `account.move`, with tickets as `mail.thread` records. Maps are still faux SVGs.

Since the last handoff, four things landed and one decision was locked:

- **A "+ New ticket" button** on Work Orders and Dispatch — the shell had no create path for a ticket at all.
- **The sign-in page** in the glass language, with a live map background. Passkeys turned out to already
  work (`auth_passkey` is `auto_install`); the button just needed skinning.
- **`/odoo` is gone from the product URLs.** `/dispatch`, `/workorders`, `/pipeline`, `/invoices`,
  `/locator`, `/home`, and `/` redirects to `/home`.
- **Screen switching was rebuilt twice** — I made it materially worse first (see Landmines) before it
  ended up genuinely responsive.
- **Auto-assign is locked**: zone first, workload as the tiebreak, no locator GPS.

Stefan reviewed the result in a normal browser tab and signed off ("Now we're talking").

## What I was doing when this ended
Nothing in flight; working tree clean. The session ended on a `/wrap` right after the last transition fix
was verified and committed.

## Repo state
- Branch `feat/strataflow-workorder`, working tree clean, **9 commits ahead of
  `origin/feat/strataflow-workorder` — not pushed.**
- This session's commits, oldest first:
  - `ff6cbb6f16c` [DOC] lock the auto-assign rule, park the USP feed
  - `6549ae14d38` [ADD] "+ New ticket" button on Work Orders and Dispatch
  - `3c43ffe7e35` [ADD] sign-in page in the Strataline glass language
  - `44aa458433a` [IMP] readable URLs, and Home at the bare domain
  - `cd7d7390283` [FIX] cross-fade between screens instead of cutting  ← **this one was a regression**
  - `d32fe2f6cfc` [IMP] drop /odoo from the product URLs
  - `c826ab246d2` [IMP] richer login background, and drop Odoo's login footer
  - `95868cd255a` [FIX] make screen changes respond instantly again  ← reverts the guts of `cd7d7390283`
  - `515bae96c1c` [FIX] stop the top bar fading in on every screen load
- Not merged into `19.0`. Merge is Stefan's call.
- `~/map-sys` is on `feat/search-key-scope`, in sync with its origin, still awaiting Stefan's review.
  Untouched this session.
- Still no automated tests for this module.

## Next steps
`BACKLOG.md` is the queue. In the order I would take them:
1. **Push this branch** — 9 commits sitting local.
2. **Answer the USP feed question** (`BACKLOG.md` › Open questions). It now carries its dependent
   sub-question: under DB-per-tenant, does ingest run as an `ir.cron` per tenant DB, or as one
   strataline-side service writing in over JSON-RPC? Not answerable before the transport is known.
3. **Build zone-first auto-assign.** Decided, not built. One sub-decision first: how a zone is
   represented and how a ticket gets one — four options are written out in `BACKLOG.md` so they do not
   need re-deriving.
4. **`README.md`** — the one fully unblocked item that needs no browser.
5. **The internal-screen revamp** — large; scope before touching. Should settle `.o_sf_btn--primary`,
   which still uses the ink mixin.
6. Still outstanding from before: MapLibre swap (`core/shell.xml` `FauxMap`, `screens/workorders.xml`
   ticket canvas), a stored sort key on `strataflow.workorder`, tests for `action_invoice_closed` and
   `action_complete_locate`, and tenancy Phase 2.

## Landmines
- **Do not "smooth" an async swap with `document.startViewTransition`.** I did, in `cd7d7390283`. It
  snapshots the outgoing screen and holds that frame frozen until its callback resolves, so every screen
  change sat on a dead picture for as long as the next action took to mount — no skeleton, nothing.
  Stefan's words: "you did a horrible ux job with the loading". Reverted in `95868cd255a`. Feedback
  first, decoration second.
- **The data was never slow.** `get_board_data` answers in 26 ms with the demo set. If a screen feels
  slow, measure before theorising — the three real causes were an optimistic-state bug, an animation on
  chrome that never changes, and Odoo's own white showing between unmount and mount.
- **The skeleton must not fake the chrome.** It used to draw its own top bar at `z-index: 999` over the
  real one and then fade out, which read as the whole top of the app fading in on every load. The real
  bar and footer now sit at `z-index: 1000` (`strataflow.scss:86`) above the skeleton. Anything added to
  the shell that needs no data belongs above the skeleton, not boned out inside it.
- **`holdPageGround` (`core/shell.js:29`) uses literal hex, not tokens, on purpose.** It paints
  `<html>` to cover the gap between actions; the token block is scoped to `.o_sf`, and hoisting it to
  `<html>` would leak Strataflow's tokens onto stock Odoo pages. The values are each theme's `--bg` and
  must be kept in step with them by hand.
- **The clean URLs need THREE declarations to agree**, and the third is easy to miss: the
  `<field name="path">` on the `ir.actions.client` record, `SCREEN_PATHS` in `controllers/home.py:9`,
  and **`static path` on the screen component**. `goNav` launches screens by tag, so the record's
  `path` never reaches them — the action service takes it from the registry entry
  (`action_service.js:1298`) and without it `makeState` falls back to the tag, giving
  `/odoo/strataflow_home`. `scratchpad/pathcheck.py` cross-checks all three; run it after adding a
  screen.
- **An HTTP 200 on `/dispatch` proves nothing about client routing.** It only means the server served
  the web client shell. That is exactly how the missing `static path` above got through a green check.
  For anything the router does, read the bundle or have Stefan look.
- **Odoo forbids `@import` between asset files.** `Local import '../scss/tokens' is forbidden for
  security reasons`, followed by `Error: no mixin named tokens-light`. Shared scss must be *listed* in
  every bundle that needs it, before its consumers — see `static/scss/tokens.scss` in `__manifest__.py`.
- **Login assets live outside `static/src` deliberately.** The backend globs are
  `static/src/**/*.{scss,js,xml}`; anything for the login page under there would be swept into the
  backend bundle and restyle every stock form control in the app.
- **The automation tab cannot boot Odoo's web client, and it is not our code.** Stock Odoo fails
  identically — `/odoo/settings` gives a 108-character body with `.o_web_client` present, console showing
  only `Error: Access to storage is not allowed from this context`. The extension races Odoo's boot for
  storage. After the failed boot the page's own context reports `localStorage` fine and
  `hasStorageAccess()` true, so **the probe misleads**. Verify over JSON-RPC and by reading the served
  bundles, and hand visuals to Stefan.
- **The old cookie-injection recipe is dead in Odoo 19** — `session_id` is `httponly=True`
  (`odoo/http.py:2528`) with rotation (`odoo/http.py:2180`), so `document.cookie` cannot overwrite it,
  and the recipe's own first step (visit `/web/login`) is what plants the blocking cookie. Symptom:
  `odoo.http.SessionExpiredException` from a session that works over curl. **Auth that does work:** load
  `http://127.0.0.1:8069/web/static/img/favicon.ico` (static assets set no cookie, and 127.0.0.1 is a
  fresh origin), plant a curl-minted `session_id` with `document.cookie`, then navigate. Gets you
  authenticated; does not get you past the storage race.
- **WebAuthn is origin-bound.** Passkeys enrolled on localhost will not work on
  `<slug>.strataflow.co`, and every tenant subdomain is its own origin — a user with two workspaces
  enrols twice.
- **`post_init_hook` runs on install, never on `-u`.** And `data/strataflow_crm_account_data.xml` is
  `noupdate="1"`. Changing anything already present in a tenant database needs a migration script.
- **Action `path` is unique across every action table.** `ir_actions` is a Postgres inheritance parent,
  so the unique index cannot enforce it and `_check_path` re-checks by hand. `crm` and `work-orders` are
  already taken by stock addons — hence `pipeline` and `workorders`.
- **Zero-specificity resets:** `strataflow.scss` wraps element resets in `:where()` on purpose. If a
  component margin looks ignored, check that reset first.
- **OWL branch chains:** lifting a block out of a `t-if`/`t-elif` chain and re-inserting it creates a
  second independent group, so two branches render at once. The Locator's stage chain must stay one
  chain.
- **ReportLab writes `/Filter [/ASCII85Decode /FlateDecode]`.** Raw `zlib.decompress` over the PDF
  streams yields nothing and will happily "prove" whatever you hoped. Use `PyPDF2`, which is in the venv.
- `--log-level=warn` suppresses the "Modules loaded" line, so an `until grep` wait on it never returns.
  Poll HTTP instead.
- Odoo 19 renames: `res.groups.privilege_id`, `crm.lead.recurring_plan`, luxon is a global, Sass
  swallows CSS `min()`. Grep the stock model before using a field name from memory.
- `get_board_data` (`models/strataflow_workorder.py:166`) returns every ticket; needs a domain/limit
  before real volumes.

## Environment / setup
- Read `CLAUDE.md` (protocol), `BACKLOG.md` (the queue), then `ARCHITECTURE.md` (locked decisions).
- `~/strataflow/.venv` (gitignored). Postgres via Homebrew; DB `strataflow_dev` with demo.
- Run: `.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons --dev=xml --http-port=8069 --log-level=warn`
  plus `-u strataflow_workorder` after any Python/XML/JS/SCSS change — **SCSS changes need the restart**.
  Fresh DB: `dropdb strataflow_dev`, then the same command with `-i strataflow_workorder --with-demo`
  (~4 min). **A server is still running on 8069 from this session.**
- Screens are now at `/home`, `/dispatch`, `/workorders`, `/pipeline`, `/invoices`, `/locator`; `/`
  redirects to `/home`. `/odoo/<same path>` and the old `/odoo/action-<xmlid>` URLs still resolve, and
  `/odoo` still reaches the stock backend — that last one is what the shell's avatar button depends on.
- Verifying without a browser: `POST /web/session/authenticate` (admin/admin on the dev DB) and drive
  `call_kw` from a small script. The agent does not type passwords into the browser. The URL checks from
  this session are in the scratchpad as `urlcheck2.py` — worth re-creating in the repo if they are going
  to be run again.
- Git identity is repo-local `Stefan Djordjevic <dev@authex.co>`; pushes use the `authexinc` GitHub login.

## Open decisions
1. **How do we hook into the USP feed?** Transport, record shape, auth, cadence — and then whether ingest
   runs per tenant DB or through one strataline-side service. Both halves in `BACKLOG.md`. Until it
   exists, `source` is always `manual`.
2. **How is a zone represented, and how does a ticket get one?** Blocks the auto-assign build. Four
   options are written out verbatim in `BACKLOG.md` (a `strataflow.zone` model by postal prefix; the same
   by ATS township/range off `lld`; a bbox per zone; a plain Char both sides).

Answered this session and now locked in `ARCHITECTURE.md`: **Auto-assign is zone-first with workload as
the tiebreak, and locator GPS is out of scope.** Also settled by Stefan in passing: the login page drops
"Manage Databases" and "Powered by Odoo".

Still waiting on him from before: the two merges (`feat/search-key-scope` in `~/map-sys`, and this branch
into `19.0`), plus the push of this branch.
