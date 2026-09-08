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

## Provisioner flow (Phase 2, not built)
1. `exp_duplicate_database('strataflow_template', slug)` over Odoo `db` XML-RPC (master password).
2. Create the admin `res.users` with the signup email; `action_reset_password` sends the set-password link.
3. Mint a strataline key for the org (`bbox` from "business operation location", `origins = https://<slug>.strataflow.co`).
4. Store it in tenant `ir.config_parameter` (`strataline.api_key`); Stripe webhook flips `strataline.access`.

## Required changes on strataline (Phase 0, not built)
1. `web/serve.py` ~L1390: API keys reach `/tiles/*` only; add `search` as a grantable source so
   `/search/address|features|lld` accept `X-Api-Key`. Rural dispatch by LLD depends on it.
2. `scripts/manage_access.py`: make `cmd_key_create` importable by the provisioner (no new public endpoint).

## Phases
| Phase | Where | Status |
|---|---|---|
| 0 | strataline key scope + importable key minting | not started |
| 1 | `strataflow_workorder` — six screens on the glass shell | **done** (faux maps; MapLibre pending Phase 0) |
| 2 | control plane: template DB, provisioner, wildcard nginx + dbfilter, welcome-page hook | not started |
| 3 | per-user tile tokens, tenant delete/backup, monitoring | not started |
