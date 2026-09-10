# Handoff — 2026-09-10 (morning)

## Start here: flow.strataline.co is live; three loose ends are Stefan's

`https://flow.strataline.co/` runs tonight's `feat/strataflow-workorder` on the **map-sys box
`74.208.133.70`** (not 66.179.209.155 — that one is vmte, a trading stack; hands off). TLS by certbot,
nginx site `deploy/nginx/flow.strataline.co`, Odoo as `systemctl status strataflow`, postgres `16/main`
on port 5433, deploy over a forced-command key that runs `scripts/vps_deploy.sh`. Verified from outside:
`/` → `/app/desk`, `/odoo/…` → 301 `/app/…`, signed-in `/app/desk` 200, login page seen in Chrome.

Stefan still has to:
1. **Set the Actions secrets** (classifier blocks me):
   ```
   gh secret set DEPLOY_SSH_KEY --repo authexinc/strataflow < ~/.ssh/strataflow_deploy_ed25519
   ssh-keyscan -t ed25519 74.208.133.70 | gh secret set DEPLOY_KNOWN_HOSTS --repo authexinc/strataflow
   ```
   Until then every push to `feat/strataflow-workorder` or `19.0` shows a failed `deploy` run. Manual
   deploy meanwhile: `ssh -i ~/.ssh/strataflow_deploy_ed25519 root@74.208.133.70 deploy`.
2. **Change `admin`/`admin` on production** (Preferences › Account security). The master password is in
   `/root/strataflow-admin-passwd` on the box; `list_db = False`, `/web/database/*` is 404 at the edge.
3. **Cloudflare**: the `flow` record is DNS-only. The box's ufw is meant to admit only Cloudflare on
   80/443 (`map-sys/scripts/vps_cf_firewall.sh`); a world-open hold rule is why it works today. Proxy it
   (orange cloud) when you are ready to close that.

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
- Branch `feat/strataflow-workorder`, up to date with origin. Not merged into `19.0`.
- `scratchpad/` untracked and not in `.gitignore`.
- `~/.ssh/strataflow_deploy_ed25519{,.pub}` — the deploy key. Public half is in root's
  `authorized_keys` on 74.208.133.70 with the forced command.
- On the box: `/opt/strataflow` (owner `strataflow`), `/etc/strataflow/{odoo.conf,deploy_branch}`,
  `/var/lib/strataflow`, `/var/log/strataflow/odoo.log`, `/root/strataflow-bootstrap.log`.

## Next steps
1. Stefan's three items above, then walk the six screens on production with him.
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
2. **Proxy `flow` through Cloudflare?** Intended by the box's firewall; Stefan's timing.
3. **Demo data on prod?** None loaded. `WITH_DEMO=1` re-run would not add it to an initialised DB;
   it would need `-i`/demo tooling by hand.
4. Unchanged: `/app` as the prefix (mine, unasked), certbot email `dev@authex.co`.
