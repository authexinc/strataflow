# Handoff — 2026-09-08 (late)

## ⚠ Start here: signing in still lands on /odoo/discuss

**This is broken and was not fixed.** Stefan reported it three times; three attempts missed. Read the
top `DEVLOG.md` entry before touching anything — it has the full trail so you do not repeat it.

Symptom: signed out, click Log in, end up on `/odoo/discuss` instead of the Strataflow Home screen.

What is genuinely verified now:
- Signed out, `/` lands on `/web/login?redirect=%2Fhome%3F`, and the form's hidden `redirect` field
  reads `/home?`. **Seen in Chrome**, not just over HTTP.
- POSTing the real login form with `redirect=/home?` returns `303 -> /home`. Redirect matrix over
  HTTP: `/odoo?`, `/odoo`, `/web` all give `/home`; `/dispatch` and `/odoo/settings` are honoured.

What has never been verified, and is where the bug almost certainly lives:
- **Everything after the form POST.** I have never completed a login in a browser — the automation
  tab cannot boot Odoo's web client, and I do not type passwords into browsers. So the entire
  client-side half is unchecked.

**Prime hypothesis: it is client-side, not the redirect.** The server sends you to `/home`; the web
client boots there and must resolve that path to a screen itself. If it fails it falls back to the
default menu action — Discuss — and rewrites the URL to `/odoo/discuss`, which is exactly the
reported symptom and would look identical however correct the server redirect is. Two things to
check, in order:

1. **`router.js:325` is a hard dependency on the literal `/odoo` prefix, and it is not patchable.**
   The internal-link interceptor only runs when `browser.location.pathname.startsWith("/odoo")`. On
   `/home` that is false, so the whole click-interception / `ROUTE_CHANGE` path is skipped. Upstream
   documents `stateToUrl` / `urlToState` as the seam for custom URLs and both are patched
   (`static/src/core/router_paths.js`) — this guard is not, and reads `browser.location` directly.
2. **`action_service.js:529`** resolves a client action from a URL via
   `actionRegistry.getEntries().find((a) => a[1].path === state.action)`. That needs the `static path`
   on each screen component (added in `28d5087bf95`) to match at runtime. Confirmed present in the
   served bundle; never confirmed as actually matching.

**Recommendation: strongly consider reverting the root-path serving.** Take out `SCREEN_PATHS` in
`controllers/home.py` and `static/src/core/router_paths.js`, go back to `/odoo/<path>` — which worked
and was verified — and do the prefix strip in nginx at the tenant edge. That is how I originally
scoped it before finding the `stateToUrl` comment and talking myself into the in-app approach. Point 1
is one place the router assumes its own prefix with no hook; there are likely others. A clean URL is
worth having, but not at the cost of an unstable web client.

## Current state
`addons/strataflow_workorder` is the only custom module on this Odoo 19 CE fork. Six fullscreen OWL
screens (Home, Dispatch, Work Orders, CRM, Invoices, Locator) render in the Strataline glass shell,
backed by stock `crm.lead` and `account.move`, with tickets as `mail.thread` records. Maps are still
faux SVGs.

Landed this session:
- **"+ New ticket"** on Work Orders and Dispatch — the shell had no create path for a ticket at all.
- **The sign-in page** in the glass language, with a live map background. Odoo's footer links removed
  on Stefan's call. Passkeys already worked (`auth_passkey` is `auto_install`); the button was skinned.
- **Screen switching** — rebuilt twice. I made it materially worse first with a View Transition; the
  version Stefan signed off ("Now we're talking") is optimistic nav highlight + content-only fade +
  a page ground held across the action swap.
- **Auto-assign decision locked**: zone first, workload as the tiebreak, no locator GPS.
- **Clean URLs** — and see the warning at the top: this is the change under suspicion.

## What I was doing when this ended
Third failed attempt at the login redirect, then wrapping on Stefan's instruction. Working tree clean.

## Repo state
- Branch `feat/strataflow-workorder`, working tree clean, **17 commits ahead of
  `origin/feat/strataflow-workorder` — not pushed.**
- The load-bearing ones, oldest first: `ff6cbb6f16c` (auto-assign decision), `6549ae14d38` (+ New
  ticket), `3c43ffe7e35` (sign-in page), `44aa458433a` (readable URLs), `cd7d7390283` (**regression** —
  the View Transition), `d32fe2f6cfc` (drop /odoo from URLs), `c826ab246d2` (login background, footer),
  `95868cd255a` (reverts the guts of `cd7d7390283`), `515bae96c1c` (top bar no longer fades),
  `28d5087bf95` (`static path` on components — the URL work did not work before this),
  `fd5a38aabe5` (login redirect, attempt 1 — **did not fix it**), `e592e9946ea` (attempt 2 —
  **did not fix it**), plus doc commits.
- Not merged into `19.0`. Merge is Stefan's call.
- `~/map-sys` is on `feat/search-key-scope`, in sync with its origin, untouched this session.
- Still no automated tests for this module.

## Next steps
1. **Fix the login redirect** — top of this file. Consider the revert before adding more code.
2. **Push the branch** — 17 commits sitting local.
3. **Answer the USP feed question** (`BACKLOG.md` › Open questions), including its dependent
   sub-question: `ir.cron` per tenant DB, or one strataline-side service over JSON-RPC?
4. **Build zone-first auto-assign.** Decided, not built; one sub-decision first (how a zone is
   represented), four options written out in `BACKLOG.md`.
5. **`README.md`** — unblocked, needs no browser.
6. **The internal-screen revamp** — large; should settle `.o_sf_btn--primary`, still on the ink mixin.
7. Older: MapLibre swap, a stored sort key on `strataflow.workorder`, tests for
   `action_invoice_closed` and `action_complete_locate`, tenancy Phase 2.

## Landmines
- **"Verified server-side" is not "verified".** Three times this session I called something fixed on
  evidence that could not support it: an HTTP 200 that only proved the server served a shell, a login
  test on a path the user never takes, and a browser check that stopped at the form. Every miss was
  client-side, and Stefan found each in seconds. When the app cannot be run, the honest word is
  **unverified**.
- **Test the entry point the user actually uses.** `/web/login` has no redirect; `/` does. The whole
  login bug lived in that difference.
- **The router assumes its own `/odoo` prefix in places it does not expose a hook for** —
  `router.js:325` is the one found so far. `stateToUrl` / `urlToState` are patchable; this is not.
- **The clean URLs need THREE declarations to agree**: `<field name="path">` on the
  `ir.actions.client` record, `SCREEN_PATHS` in `controllers/home.py`, and **`static path` on the
  screen component**. `goNav` launches screens by tag, so the record's `path` never reaches them —
  without the static, `makeState` falls back to the tag and you get `/odoo/strataflow_home`.
  `scratchpad/pathcheck.py` cross-checks all three.
- **Do not "smooth" an async swap with `document.startViewTransition`.** It snapshots the outgoing
  screen and freezes that frame until the callback resolves, so every screen change sat on a dead
  picture for as long as the next action took to mount. Reverted in `95868cd255a`. Feedback first,
  decoration second.
- **The data was never slow.** `get_board_data` answers in 26 ms. Measure before theorising.
- **The skeleton must not fake chrome that needs no data.** It drew its own top bar at `z-index: 999`
  over the real one and faded out, which read as the whole top of the app fading in on every load.
  Real bar and footer now sit at `z-index: 1000` (`strataflow.scss:86`).
- **`holdPageGround` (`core/shell.js:29`) uses literal hex, not tokens, on purpose** — it paints
  `<html>`, and hoisting the `.o_sf`-scoped token block there would leak onto stock Odoo pages. The
  values are each theme's `--bg` and must be kept in step by hand.
- **Odoo forbids `@import` between asset files** — `Local import '../scss/tokens' is forbidden for
  security reasons`, then `Error: no mixin named tokens-light`. Shared scss must be *listed* in every
  bundle that needs it, before its consumers.
- **Login assets live outside `static/src` deliberately** — the backend globs would otherwise sweep
  them into the backend bundle and restyle every stock form control.
- **The automation tab cannot boot Odoo's web client, and it is not our code.** Stock Odoo fails
  identically (`/odoo/settings` gives a 108-character body), console showing only `Error: Access to
  storage is not allowed from this context`. After the failed boot the page reports `localStorage`
  fine and `hasStorageAccess()` true, so **the probe misleads**.
- **The old cookie-injection recipe is dead in Odoo 19** — `session_id` is `httponly=True`
  (`odoo/http.py:2528`) with rotation (`odoo/http.py:2180`), and the recipe's own first step (visit
  `/web/login`) plants the blocking cookie. Symptom: `odoo.http.SessionExpiredException` from a session
  that works over curl. **Auth that does work:** load
  `http://127.0.0.1:8069/web/static/img/favicon.ico` (static assets set no cookie, 127.0.0.1 is a fresh
  origin), plant a curl-minted `session_id`, then navigate. Gets you authenticated; does not get you
  past the storage race.
- **127.0.0.1 and localhost are separate cookie origins.** Useful: it lets you test a signed-out flow
  without logging Stefan out of his own session.
- **WebAuthn is origin-bound.** Passkeys enrolled on localhost will not work on
  `<slug>.strataflow.co`, and every tenant subdomain is its own origin.
- **`post_init_hook` runs on install, never on `-u`**, and `data/strataflow_crm_account_data.xml` is
  `noupdate="1"`. Changing anything already in a tenant DB needs a migration script.
- **Action `path` is unique across every action table** (`ir_actions` is a Postgres inheritance parent,
  so `_check_path` re-checks by hand). `crm` and `work-orders` are taken by stock addons — hence
  `pipeline` and `workorders`.
- **Zero-specificity resets:** `strataflow.scss` wraps element resets in `:where()` on purpose. If a
  component margin looks ignored, check that reset first.
- **OWL branch chains:** lifting a block out of a `t-if`/`t-elif` chain and re-inserting it creates a
  second independent group, so two branches render at once. The Locator's stage chain must stay one.
- **ReportLab writes `/Filter [/ASCII85Decode /FlateDecode]`.** Raw `zlib.decompress` over the PDF
  streams yields nothing and will happily "prove" whatever you hoped. Use `PyPDF2`, in the venv.
- `--log-level=warn` suppresses the "Modules loaded" line, so an `until grep` on it never returns.
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
  Fresh DB: `dropdb strataflow_dev`, then the same with `-i strataflow_workorder --with-demo` (~4 min).
  **A server is still running on 8069 from this session.**
- Screens are at `/home`, `/dispatch`, `/workorders`, `/pipeline`, `/invoices`, `/locator`; `/`
  redirects to `/home`. `/odoo/<same path>` and old `/odoo/action-<xmlid>` URLs still resolve, and
  `/odoo` still reaches the stock backend — the shell's avatar button depends on that.
- The throwaway checks from this session are in the scratchpad and are worth re-creating in the repo
  if they will be run again: `pathcheck.py` (the three path declarations agree), `logincheck.py`
  (drives the real login form), `urlcheck2.py` (URL resolution — note its 200-only assertions are the
  weak kind that missed a bug).
- Git identity is repo-local `Stefan Djordjevic <dev@authex.co>`; pushes use the `authexinc` login.

## Open decisions
1. **How do we hook into the USP feed?** Transport, record shape, auth, cadence — then whether ingest
   runs per tenant DB or through one strataline-side service. Both halves in `BACKLOG.md`. Until it
   exists, `source` is always `manual`.
2. **How is a zone represented, and how does a ticket get one?** Blocks the auto-assign build; four
   options written out verbatim in `BACKLOG.md`.
3. **Keep the root-path URLs, or revert to `/odoo/<path>` plus an nginx strip?** See the top of this
   file. My recommendation is to revert; it is Stefan's call.

Locked in `ARCHITECTURE.md` this session: **Auto-assign is zone-first with workload as the tiebreak,
locator GPS out of scope.** Settled in passing: the login page drops "Manage Databases" and "Powered
by Odoo".

Still waiting on Stefan from before: the two merges (`feat/search-key-scope` in `~/map-sys`, and this
branch into `19.0`), plus the push of this branch.
