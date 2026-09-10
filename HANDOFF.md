# Handoff — 2026-09-10 (morning)

## Start here: production is complete; one item is Stefan's, one is a look

`https://flow.strataline.co/` runs `feat/strataflow-workorder` on the **map-sys box `74.208.133.70`**
(66.179.209.155 is vmte, a trading stack — hands off). Cloudflare-proxied, TLS by certbot, nginx site
`deploy/nginx/flow.strataline.co`, Odoo as `systemctl status strataflow`, postgres `16/main` on 5433.
**CI/CD is proven**: a push to `feat/strataflow-workorder` (or `19.0`) runs `.github/workflows/deploy.yml`
→ forced-command `scripts/vps_deploy.sh` on the box; the last run is green. Demo tickets, leads and
locator users are seeded (module demo only, no Odoo sample invoices). The map is hooked to the live
strataline.co with key `k_3f7cf1e3` (origin `https://flow.strataline.co`); every endpoint it uses was
exercised with curl and the tenant's origin.

1. **Stefan: change `admin`/`admin` on production** (Preferences › Account security). Master password
   is `/root/strataflow-admin-passwd` on the box.
2. **Look at Dispatch on production in a browser** — I could not (cookie plant blocked). Expect Calgary
   utility lines over the basemap; if the ground is the skeleton instead, open devtools › Network for
   `strataline.co/…?key=` requests and check the status.

## Current state
Sign-in is invitation-only now (`auth_signup.invitation_scope = b2b` on prod and dev, and in
`data/strataflow_config_data.xml` for new databases — Odoo 19 defaults to b2c, which had `/web/signup` open
on production). Module unchanged in function since the previous handoff except: web client at `/app/<path>` (router
patch `static/src/core/app_url.js`, routes in `controllers/home.py`), StrataFlow title/favicon/PWA name
(`views/strataflow_branding.xml`, `branding.js`, `static/description/`), brand text `StrataFlow`. Stock-view
sweep still at step 2 of 7 (`tasks/03-stock-view-sweep.md`; `BACKLOG.md` › UI).

Production layout is in `deploy/README.md`. The box follows `/etc/strataflow/deploy_branch`
(`feat/strataflow-workorder`); a push to that branch deploys once the secrets exist. To move production to
`19.0`, merge, then write `19.0` into that file — a push to `19.0` before the merge would deploy a tree
without the module (that happened once tonight and was restored by hand).

## What I was doing when this ended
Writing this after the `proxy_hide_header X-Frame-Options` tweak (in the repo and applied on the box).
Local dev server on 8069 is up with `-u` applied; the Chrome automation tab is on the production login
page, signed out. Everything is committed and pushed.

## Repo state
- Branch `feat/strataflow-workorder`, up to date with origin, deployed. Not merged into `19.0`.
- `scratchpad/` untracked and not in `.gitignore`.
- `~/.ssh/strataflow_deploy_ed25519{,.pub}` — the deploy key. Public half is in root's
  `authorized_keys` on 74.208.133.70 with the forced command.
- On the box: `/opt/strataflow` (owner `strataflow`), `/etc/strataflow/{odoo.conf,deploy_branch}`,
  `/var/lib/strataflow`, `/var/log/strataflow/odoo.log`, `/root/strataflow-bootstrap.log`.

## Next steps
1. The two items above, then walk the six screens on production with him.
2. `BACKLOG.md` › Platform › "Deploy follow-ups" (PWA manifest, `/odoo` anchor clicks, `.gitignore`).
3. Stock-view sweep steps 3–7.

## Landmines
- **Never let the box follow a branch without the module.** `vps_deploy.sh` hard-resets to
  `origin/<deploy_branch>`; the module vanishing from disk leaves Odoo up and every page broken.
- **Postgres on that box is port 5433**, socket peer auth. `db_host`/`db_password` must be absent from
  `odoo.conf`, not `False` (Odoo 19 warns and skips).
- **`/etc/strataflow` must be `root:strataflow 750`** — the service user reads `odoo.conf` from it.
- **All git on the box as `strataflow`** (`runuser -u strataflow -- git …`); root gets "dubious ownership".
- **Do not touch ufw on that box** — map-sys's Cloudflare lockdown plus a hold rule live there; the
  bootstrap skips it when active. Certbot HTTP-01 depends on 80 being reachable from Let's Encrypt.
- **`pgrep -f` matches the ssh command that runs it**; anchor patterns (`^bash /root/…`).
- Everything from the two previous handoffs still holds (router `startRouter()` re-run, debounced
  `pushState`, `@http.route()` cannot add a path, classifier blocks on `gh secret set` and `.env` reads).

## Environment / setup
- Dev: `.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons --dev=xml
  --http-port=8069 --log-level=warn -u strataflow_workorder`.
- Prod: `ssh root@74.208.133.70`; `systemctl restart strataflow`; `tail -f /var/log/strataflow/odoo.log`;
  re-run `/root/strataflow_bootstrap.sh` is safe (idempotent).
- Git identity is repo-local `Stefan Djordjevic <dev@authex.co>`.

## Open decisions
1. **When does production move to `19.0`?** At merge; one-line file edit on the box.
2. **Odoo's own demo data on prod?** Only the module's demo is loaded (the demo flag + `-u` trick,
   DEVLOG). Sample invoices need a fresh `--with-demo` database — Stefan runs the `dropdb`.
4. Unchanged: `/app` as the prefix (mine, unasked), certbot email `dev@authex.co`.
