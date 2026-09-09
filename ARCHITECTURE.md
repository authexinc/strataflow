# strataflow architecture

Strataflow = Odoo 19 CE fork that utility-locate companies sign up for. Strataline (`~/map-sys`, live at
strataline.co) supplies the map tiles and address / feature / LLD search. Decided 2026-09-08 with Stefan; do not
relitigate without him.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Tenancy | **DB-per-tenant**, `<slug>.strataflow.co` → `dbfilter=^%d$` | Odoo's own SaaS does this. Multi-company is for one org with subsidiaries; any model without `company_id` leaks across strangers, and per-tenant backup/delete is impossible. |
| Provisioning | `exp_duplicate_database('strataflow_template', slug)` from a pre-installed template | Seconds, not a minutes-long module install. |
| Signup | **On strataline's welcome page** (Supabase email/password, 14-day DB-tracked trial), plus a workspace-subdomain field | The loop already works. Odoo `auth_signup` creates a user in one DB; it cannot create DBs. |
| Billing | **One Stripe subscription ($200 CAD/mo) covers both products** — "for now, may change" | Keep it simple. |
| Provisioner | Separate small service, not bolted onto `map-sys/web/serve.py` | serve.py is stdlib and freshly security-hardened; keep its blast radius small. |
| Map integration | Odoo is a **client** of strataline's scoped API keys (`bbox`, `sources`, `max-zoom`, `daily`, `origins`) | Keys already exist (`scripts/manage_access.py`) and hot-reload from `data/api_keys.json`. |
| Tile key exposure | Phase 1: key in the browser with origin scoping (same as existing integrations). Phase 3: short-lived per-user tile tokens from serve.py | CORS is not a secret guard; proxying tiles through Odoo workers is the wrong fix. |
| Work order model | Fresh `strataflow.workorder`, not `mrp.workorder` | Locate tickets are not manufacturing. |
| Data layer | Stock `crm.lead`, `account.move`, `mail.thread`, `res.partner` with smart buttons | Real modules, not stand-ins. |

## Product decisions (Stefan, 2026-09-08)
Answers to the six questions that sat open in HANDOFF, plus ticket creation and the auto-assign rule
settled since. Same rule as above: do not relitigate without him.

| Question | Choice | Rationale / where it lives |
|---|---|---|
| Locator "Confirm & close" | **Stops at `located`** | Closing is what `action_invoice_closed` bills, so one tap in the truck must not raise an invoice. The dispatcher closes from Work Orders after reviewing the print. `models/strataflow_workorder.py` `action_complete_locate`; the button now reads "Confirm locate". |
| CRM stage names | **Rename "Proposition" to "Quote sent"** | The design's pipeline wording; the other three stock stages stand. Applied by `post_init_hook` and only when the stage still carries Odoo's default name, so a tenant's own rename survives. |
| Invoice numbering | **Keep Odoo's `INV/2026/00001`** | Numbering is an audit trail — the stock sequence is what Odoo's accounting reports, locking and gap detection expect. The design's format was cosmetic. No code. |
| Locate pricing | **Flat per ticket** ($250, product "Locate service") | Simplest to invoice and explain; a second product can be added later without touching the close-to-invoice path. No code. |
| Fonts | **Ship Public Sans + JetBrains Mono locally** | Variable woff2, latin subset, 27 KB + 40 KB in `static/fonts/` with their OFL licences, `font-display: swap`. Self-hosted rather than a font CDN: a tenant subdomain should not call a third party to render its own UI. |
| Ticket creation in the shell | **Yes — a "+ New ticket" button, matching CRM and Invoices** | Answered 2026-09-08. Today there is no create path in the Strataflow UI at all: CRM and Invoices carry "+ New" buttons, Work Orders and Dispatch carry none, so a ticket can only come from the stock Odoo form, demo data or RPC. Manual entry becomes a first-class path in the shell rather than a trip out to Odoo. Not built — see `BACKLOG.md`. |
| Auto-assign rule | **Zone first, workload as tiebreak** — locator GPS is out of scope | Answered 2026-09-08. Filter to the locators whose zone covers the ticket, then give it to the least-loaded among them; fall back to pure workload when no zone matches. This rules out both alternatives that needed a position source: real staff GPS (and the privacy call that comes with it) and the current-ticket approximation in `screens/dispatch.js:95` `crewAnchors`. Today's auto-assign is distance-greedy (`core/geo.js:45` `planRoutes`), so this is a replacement, not a first build — see `BACKLOG.md`. |
| Product URLs | **`/odoo/<path>` in the web client; the clean `https://<slug>.strataflow.co/dispatch` form is an nginx rewrite at the tenant edge (Phase 2)** | Answered 2026-09-08 after serving the screens at the domain root was tried and reverted (`b13cadcd239`). Odoo's router assumes its own `/odoo` prefix in places it exposes no hook for (`web/static/src/core/browser/router.js`, the internal-link guard), and the revert stands as the decision even though the login bug turned out to be something else (`e5453e0db49`, below). `path` on each client action plus `static path` on each screen component is what makes `/odoo/<path>` resolve; keep both. **A path may not equal any stock client-action tag**: the web client resolves a URL by registry tag before path, and stock's `home` tag is an action that navigates to `/` — so the Home screen is `/odoo/desk`, not `/odoo/home`. Check new paths against `registry.category("actions").add("…")` across `addons/*/static/src`. |
| Zone representation for auto-assign | **A `strataflow.zone` model, many2many on `res.users`, matched to the ticket by postal-code prefix** | Answered 2026-09-08. Works for hand-entered tickets with no coordinates, which is exactly the population the zone-first rule was chosen to include. ATS township/range off `lld` and a bbox per zone were the alternatives; the first only works when `lld` is populated, the second reintroduces the coordinate dependency. A plain typed Char was rejected as too easy to get wrong. Not built — see `BACKLOG.md`. |
| Equipment / Timesheets / Reports | **Stay "coming soon"** | Finish the six screens, the MapLibre swap and tenancy first. Each extra module is more install time and more surface per tenant before there is a paying tenant asking for it. |

## Provisioner flow (Phase 2, not built)
1. `exp_duplicate_database('strataflow_template', slug)` over Odoo `db` XML-RPC (master password).
2. Create the admin `res.users` with the signup email; `action_reset_password` sends the set-password link.
3. Mint a strataline key for the org (`bbox` from "business operation location", `origins = https://<slug>.strataflow.co`).
4. Store it in tenant `ir.config_parameter` (`strataline.api_key`); Stripe webhook flips `strataline.access`.

## Required changes on strataline (Phase 0, built 2026-09-08, awaiting merge)
Both are on `~/map-sys` branch `feat/search-key-scope` (7e466cf), unpushed — `main` there deploys
itself, so the merge is Stefan's call. Until it lands, prod keys still reach `/tiles/*` only.
1. `web/serve.py`: `search` is a grantable pseudo-source. A key holding it may call
   `/search/address|features|lld` by `X-Api-Key` header or `?key=`; results are restricted to the
   key's bbox inside the SQL, and `daily_searches` is counted apart from `daily_tiles`.
2. `scripts/manage_access.py`: `create_key(...)` is importable by the provisioner and returns
   `(record, raw_secret)`; the CLI is a wrapper over it. No new public endpoint.

## Phases
| Phase | Where | Status |
|---|---|---|
| 0 | strataline key scope + importable key minting | **built** (map-sys `feat/search-key-scope`, not merged/deployed) |
| 1 | `strataflow_workorder` — six screens on the glass shell | **done** (faux maps; MapLibre pending Phase 0) |
| 2 | control plane: template DB, provisioner, wildcard nginx + dbfilter (+ the `/odoo` prefix strip for clean tenant URLs), welcome-page hook | not started |
| 3 | per-user tile tokens, tenant delete/backup, monitoring | not started |
