# strataflow — agent instructions

Odoo 19 CE fork (`authexinc/strataflow`). All product work lives in `addons/strataflow_workorder/`; everything
else is upstream Odoo and is not edited.

## Session protocol
- Start: read `HANDOFF.md`, then the last 3–5 entries of `DEVLOG.md`, then `ARCHITECTURE.md` for locked decisions.
- End (or when context is nearly exhausted): prepend a `DEVLOG.md` entry (failures mandatory, workarounds labelled),
  then overwrite `HANDOFF.md`. The `/wrap` skill does both.
- Commits are authored `Stefan Djordjevic <dev@authex.co>` (repo-local git config) on a feature branch; never push
  to `19.0` directly. Merging is Stefan's call.

## Running it
- `.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons --dev=xml --http-port=8069 --log-level=warn`
- `-u strataflow_workorder` after Python/XML/JS changes; a plain reload can serve a stale JS bundle.
- Fresh DB: `dropdb strataflow_dev` then `-i strataflow_workorder --with-demo` (~4 min; pulls crm, account, mail).
- Login `admin`/`admin`. The agent never types passwords in the browser; verify over JSON-RPC or hand a curl
  session cookie to the tab (see DEVLOG 2026-09-08).

## Non-negotiables
- UI = Strataline glass shell: tokens, skeleton loader and login animation come from `~/map-sys/web/app.css`,
  `index.html#skeleton`, `login.js`. Review UI work with the `apple-design` skill before and after.
- Grep the stock Odoo 19 model before using a field name from memory (`res.groups.privilege_id`,
  `crm.lead.recurring_plan`, luxon is a global, Sass eats CSS `min()`).
- Real modules over stand-ins: CRM is `crm.lead`, invoicing is `account.move`, tickets are `mail.thread`.
- Strataline is a separate service consumed over its API; nothing from `map-sys` is copied into this repo.
