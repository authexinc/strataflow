# Deploying StrataFlow

Production is `flow.strataline.co` on `74.208.133.70` — the map-sys box (Ubuntu 24.04), shared with
strataline.co and others behind its nginx. Same shape as map-sys: git is the source of truth, a push
to `19.0` deploys. The box's ufw only admits Cloudflare on 80/443, so the record must be proxied.

| Piece | Where |
|---|---|
| Code | `/opt/strataflow`, owned by the `strataflow` system user, venv at `.venv` |
| Config | `/etc/strataflow/odoo.conf` (from `deploy/odoo.conf`; master password in `/root/strataflow-admin-passwd`) |
| Service | `systemctl {status,restart} strataflow` (`deploy/strataflow.service`) |
| Logs | `/var/log/strataflow/odoo.log` |
| Database | postgres `strataflow`, peer auth over the socket; filestore `/var/lib/strataflow` |
| Web | nginx site `deploy/nginx/flow.strataline.co`, TLS by certbot |

## First time on a box
Run `scripts/vps_bootstrap.sh` as root (header has the one-liner). It installs packages,
clones, builds the venv, creates the database with `-i strataflow_workorder`, installs the
unit and the nginx site, gets a certificate, and pins the GitHub Actions key to
`scripts/vps_deploy.sh` when `DEPLOY_PUBKEY` is given.

## Every deploy after that
`.github/workflows/deploy.yml` SSHes to the VPS with `DEPLOY_SSH_KEY` (repo secret, paired
with `DEPLOY_KNOWN_HOSTS`); the forced command runs `scripts/vps_deploy.sh`, which resets to
`origin/19.0`, updates the module with the service stopped, restarts it and curls `/web/login`.
Nothing on a feature branch deploys until it is merged into `19.0`.

## URLs
Odoo serves the web client at `/odoo/…`; the product serves it at `/app/…` as well
(`controllers/home.py`, `static/src/core/app_url.js`), and nginx 301s any `/odoo` URL to
`/app` so the vendor never appears in the address bar. `/web/database/*` is 404 at the edge.
