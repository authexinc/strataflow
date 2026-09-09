# Handoff — 2026-09-08 (night)

## Start here: the login bug is fixed, and the next job is the internal-screen revamp

**Login is fixed and verified in a browser** ("works on incognito now" — Stefan). Signing in lands
on the Home screen at `/odoo/desk`. The bug was never the redirect: `home` is the tag of a stock
client action that navigates to `/`, and the web client resolves URLs by tag before path. Full trail
in the top `DEVLOG.md` entry; the rule is in `ARCHITECTURE.md` › "Product URLs".

**Next session's job, on Stefan's instruction: the internal-screen revamp.** Every stock form/list
view a Strataflow user can reach — an individual invoice, a CRM lead, the ticket form, Settings —
into the Strataline glass language, not just the six fullscreen OWL screens. Scope and the open
sub-decision are under "Next steps"; `BACKLOG.md` › "UI / design language" has the two items.

## Current state
`addons/strataflow_workorder` is the only custom module on this Odoo 19 CE fork. Six fullscreen OWL
screens (Home, Dispatch, Work Orders, CRM, Invoices, Locator) at `/odoo/desk`, `/odoo/dispatch`,
`/odoo/workorders`, `/odoo/pipeline`, `/odoo/invoices`, `/odoo/locator`, in the Strataline glass
shell, backed by stock `crm.lead` and `account.move`, tickets as `mail.thread` records. `/` sends a
Strataflow or anonymous user to `/odoo/desk`; `/odoo` still reaches the stock backend (the shell's
avatar button depends on it). Maps are still faux SVGs.

Landed this session:
- **Root-path URLs reverted** (`b13cadcd239`): screens are back at `/odoo/<path>`; the clean
  `https://<slug>.strataflow.co/dispatch` form becomes an nginx rewrite in Phase 2. Stefan's call.
- **Login fixed** (`e5453e0db49`): Home's path renamed `home` → `desk`, in the three places that
  must agree.
- **Decisions locked** in `ARCHITECTURE.md`: URL shape; zone = `strataflow.zone` model matched by
  postal-code prefix; a path may never equal a stock client-action tag. USP feed stays deferred.
- **Branch pushed.**

## What I was doing when this ended
Wrapping. Nothing in flight. Working tree clean.

## Repo state
- Branch `feat/strataflow-workorder` at `1f2a8ff482c`, **in sync with origin**, working tree clean.
- This session's commits, oldest first: `b13cadcd239` (revert root paths), `b25f26c7de9` (lock
  decisions), `e5453e0db49` (**the login fix**, `desk` path), `1f2a8ff482c` (path-vs-tag rule).
- Not merged into `19.0`. Merge is Stefan's call.
- `~/map-sys` on `feat/search-key-scope`, untouched this session, still awaiting Stefan's merge.
- Still no automated tests for this module.

## Next steps
1. **Internal-screen revamp** (Stefan's pick). Before writing SCSS, settle two things:
   - *Where the styling attaches.* The backend bundle already carries `tokens.scss` and the shell's
     `strataflow.scss`, but everything is scoped under `.o_sf` on purpose so stock pages stay stock.
     The revamp means a deliberate second scope for stock views — probably a body class set only
     for Strataflow users (`_is_strataflow_user` in `controllers/home.py` already exists for the
     redirect, and `webclient_rendering_context` / `session_info` is the seam to carry it to the
     client). Do not lift the `.o_sf` token block to `<html>`; see the `holdPageGround` landmine.
   - *`.o_sf_btn--primary`* — the in-page primary button still uses the `ink-btn` mixin, so ink
     means both "selected nav" and "primary action" away from the top bar. Decide accent-vs-ink
     once, for the shell and the stock views together. Second item in `BACKLOG.md` › UI.
   Review with the `apple-design` skill before and after (CLAUDE.md non-negotiable). Stefan can see
   the result in a normal tab; the automation tab cannot boot the web client.
2. **Zone-first auto-assign** — decided, not built. One ticket-side sub-decision left: a ticket has
   no postal code field today; add one (and have "+ New ticket" fill it) or derive from the partner
   address. `BACKLOG.md` › Behaviour.
3. **USP feed** — still the open question; `BACKLOG.md` › Open questions.
4. **`README.md`** — needs no browser.
5. Older: MapLibre swap, stored sort key on `strataflow.workorder`, tests for
   `action_invoice_closed` / `action_complete_locate`, `get_board_data` needs a domain/limit,
   tenancy Phase 2 (now including the nginx `/odoo` prefix strip).

## Landmines
- **A client action's `path` must not equal any stock client-action tag.** The action service
  resolves a URL by registry tag first (`action_service.js:527`), and stock's `home` tag is an
  action that navigates to `/` — which is why `/odoo/home` reload-looped. Check a new path with
  a regex over `registry.category("actions").add("…")` across `addons/*/static/src` (49 tags today);
  a grep for `actionRegistry.add(` misses them all.
- **The three path declarations must agree**: `<field name="path">` on the `ir.actions.client`
  record, `static path` on the screen component, and any server-side URL (`HOME_URL`). `goNav`
  launches by tag, so without the static the URL degrades to `/odoo/strataflow_home`.
- **Never plant a `session_id` cookie on `localhost` with `document.cookie`.** It lands at a
  narrower Path, is not HttpOnly, sorts ahead of Odoo's own cookie, and splits the profile into
  two sessions: `/web/*` requests carry one, `/odoo/*` the other. Symptoms seen this session:
  login "does nothing", `ERR_TOO_MANY_REDIRECTS` between `/web/login?redirect=…` and
  `/odoo/…`, and "Session expired (invalid CSRF token)". Fix is deleting the stray cookie in
  DevTools › Application › Cookies. Use the `127.0.0.1` origin for experiments and clean up.
- **When the app cannot be run, turn on request logging** and read the cycle instead of
  theorising: `--log-level=info --log-handler=werkzeug:INFO`. It made both loops obvious in one
  screen of log. `--log-level=warn` hides all of it.
- **The automation tab still cannot boot Odoo's web client**, and the extension also blocks
  `document.cookie` reads and writes (`[BLOCKED: Cookie/query string data]`). What does work:
  install a `console.log` probe on the form, have Stefan type the credentials in that tab, read
  the console and `performance.getEntriesByType("navigation")` afterwards. I do not type
  passwords in a browser, dev credentials included.
- **"Verified server-side" is not "verified".** Holds from last session; this one proved it
  again — every HTTP check passed on a redirect that pointed at a broken destination.
- **Rerun the check after every edit, not after the batch.** A heredoc edit silently no-op'd on a
  comment mismatch and left `HOME_URL` on the old path while XML/JS were already on `desk`.
- **The router assumes its own `/odoo` prefix in places with no hook** (`router.js:325`). Reason
  the root-path serving was reverted; not to be retried in-app.
- **`holdPageGround` (`core/shell.js:29`) uses literal hex on purpose** — it paints `<html>`, and
  the `.o_sf` token block must not leak onto stock pages. Values track each theme's `--bg`.
- **Odoo forbids `@import` between asset files**; shared scss must be *listed* in every bundle
  before its consumers. Login assets live outside `static/src` so the backend globs never sweep
  them in.
- **Do not "smooth" an async swap with `document.startViewTransition`** — it freezes the outgoing
  frame for the whole load. Reverted in `95868cd255a`.
- **The skeleton must not fake chrome that needs no data.** Real bar and footer sit at
  `z-index: 1000` (`strataflow.scss:86`).
- **127.0.0.1 and localhost are separate cookie origins**; incognito is a third clean profile.
  Incognito is the fastest way to test a signed-out flow without touching Stefan's session.
- **WebAuthn is origin-bound**; passkeys enrolled on localhost will not work on a tenant subdomain.
- **`post_init_hook` runs on install, never on `-u`**, and `data/strataflow_crm_account_data.xml`
  is `noupdate="1"`. `views/strataflow_actions.xml` is *not* noupdate — the `desk` path landed
  on `-u`.
- **Action `path` is unique across every action table** (`ir_actions` is a Postgres inheritance
  parent). `crm` and `work-orders` are taken by stock; hence `pipeline` and `workorders`.
- **Zero-specificity resets** in `strataflow.scss` are wrapped in `:where()`; check there first
  when a component margin looks ignored.
- **OWL branch chains:** the Locator's stage `t-if`/`t-elif` chain must stay one chain.
- **ReportLab writes `/Filter [/ASCII85Decode /FlateDecode]`** — use `PyPDF2` in the venv, not
  raw `zlib`.
- Odoo 19 renames: `res.groups.privilege_id`, `crm.lead.recurring_plan`, luxon is a global, Sass
  swallows CSS `min()`. Grep the stock model before using a field name from memory.

## Environment / setup
- Read `CLAUDE.md`, `BACKLOG.md`, then `ARCHITECTURE.md`.
- `~/strataflow/.venv` (gitignored). Postgres via Homebrew; DB `strataflow_dev` with demo.
- Run: `.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons --dev=xml --http-port=8069 --log-level=warn`
  plus `-u strataflow_workorder` after any Python/XML/JS/SCSS change. Add
  `--log-level=info --log-handler=werkzeug:INFO` to see requests. Fresh DB: `dropdb strataflow_dev`,
  then `-i strataflow_workorder --with-demo` (~4 min).
- **A server is running on 8069 from this session, with request logging on**, log at
  `scratchpad/odoo.log`.
- Screens: `/odoo/desk`, `/odoo/dispatch`, `/odoo/workorders`, `/odoo/pipeline`, `/odoo/invoices`,
  `/odoo/locator`; `/` → `/odoo/desk`. Old `/odoo/action-<xmlid>` URLs still resolve.
- Scratchpad checks worth re-creating in-repo if they will be run again: `logincheck.py` (drives
  the real login form from `/`, plus the redirect matrix), `bundlecheck.py` (served bundle has the
  six static paths and no router patch). Both were the decisive checks this session.
- Git identity is repo-local `Stefan Djordjevic <dev@authex.co>`; pushes use the `authexinc` login.

## Open decisions
1. **USP feed transport** — unchanged, `BACKLOG.md` › Open questions; the per-tenant-cron vs
   strataline-side-service question hangs off it.
2. **Ticket-side postal code** for the zone match: new field on `strataflow.workorder`, or
   derived from the partner address. Decide with the auto-assign build.
3. **Accent vs ink for `.o_sf_btn--primary`** — decide with the revamp.

Locked this session (`ARCHITECTURE.md`): product URLs are `/odoo/<path>` with nginx doing the
clean form; zone = `strataflow.zone` by postal-code prefix; paths never equal stock tags.

Still waiting on Stefan: the two merges (`feat/search-key-scope` in `~/map-sys`, this branch into
`19.0`).
