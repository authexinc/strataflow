# Handoff — 2026-09-10 (early morning)

## Start here: the deploy kit is done and verified locally; the box itself was never reached

Stefan asked for StrataFlow on `66.179.209.155` as `flow.strataline.co`, auto-deploy like map-sys, no
"odoo" in any URL, the strataline mark as favicon, the name StrataFlow. All of it is in the repo except
the server steps, which need SSH that no local key opens (see Failures in `DEVLOG.md` 2026-09-10). What
Stefan has to do, in order:

1. **Get me (or himself) onto the box.** `ssh root@66.179.209.155` refuses `~/.ssh/id_ed25519` and
   `id_rsa` for root/ubuntu/debian/admin. Either add `~/.ssh/id_ed25519.pub` to the right user's
   `authorized_keys` through the provider console, or tell me the user name the provider created.
2. **Set the two Actions secrets** (classifier blocks me from doing it):
   ```
   gh secret set DEPLOY_SSH_KEY   --repo authexinc/strataflow < ~/.ssh/strataflow_deploy_ed25519
   ssh-keyscan -t ed25519 66.179.209.155 | gh secret set DEPLOY_KNOWN_HOSTS --repo authexinc/strataflow
   ```
3. **Bootstrap the server** as root (one-time, idempotent; `WITH_DEMO=1` to seed demo data):
   ```
   curl -fsSL https://raw.githubusercontent.com/authexinc/strataflow/feat/strataflow-workorder/scripts/vps_bootstrap.sh \
     | BRANCH=feat/strataflow-workorder DEPLOY_PUBKEY="$(cat ~/.ssh/strataflow_deploy_ed25519.pub)" bash
   ```
   `BRANCH=feat/strataflow-workorder` puts tonight's code on the box now; auto-deploy tracks `19.0`, so the
   first push to `19.0` (Stefan's merge) takes over from there. Master password lands in
   `/root/strataflow-admin-passwd`. Then sign in as `admin`/`admin` and change it.
4. Push this branch if it is not already on origin (`git push` may be classifier-blocked in auto mode).

## Current state
`addons/strataflow_workorder` on Odoo 19 CE. Six fullscreen OWL screens, now at `/app/desk`,
`/app/dispatch`, `/app/workorders`, `/app/pipeline`, `/app/invoices`, `/app/locator`; `/` → `/app/desk`;
`/odoo/…` still answers (nginx 301s it in prod). Window title and favicon say StrataFlow. Stock views
restyled as before (the stock-view sweep brief `tasks/03-stock-view-sweep.md` is at step 2 of 7 — steps
3–7 remain, see `BACKLOG.md` › UI › "Internal screen revamp"; untouched tonight).

New tonight:
- `controllers/home.py` — `/app` routes, `HOME_URL = '/app/desk'`.
- `static/src/core/app_url.js` — router prefix patch + second `startRouter()`.
- `static/src/core/branding.js`, `views/strataflow_branding.xml`, `static/description/{favicon.svg,icon.png}`.
- `deploy/` (nginx site, `odoo.conf`, systemd unit, README), `scripts/vps_bootstrap.sh`,
  `scripts/vps_deploy.sh`, `.github/workflows/deploy.yml`.
- `ARCHITECTURE.md` › "Product URLs" rewritten; `BACKLOG.md` › Platform has the deploy items.

## What I was doing when this ended
Writing this. Local dev server is up on 8069 with `-u` applied; the automation tab (tab in the MCP group)
is authenticated on `http://localhost:8069/app/invoices/account.move/71`. Tree has the commit below,
push attempted at the end of the session (see the last DEVLOG line if it went through).

## Repo state
- Branch `feat/strataflow-workorder`; one new commit on top of `0bcfeaf9f28`. Not merged into `19.0`.
- `scratchpad/` untracked and not in `.gitignore` (still one `git add -A` from committing `odoo.log`).
- `~/.ssh/strataflow_deploy_ed25519{,.pub}` — the GitHub Actions deploy key. Not in the repo.
- `~/map-sys` untouched.

## Next steps
1. Steps 1–3 above, then load `https://flow.strataline.co/` and walk the six screens.
2. After the first deploy: Cloudflare-proxy the record and lock 80/443 to Cloudflare like map-sys
   (`BACKLOG.md` › Platform › "Deploy follow-ups").
3. Stock-view sweep steps 3–7 (unchanged from the previous handoff).

## Landmines
- **`startRouter()` must be re-run after patching the router** — router.js ran it at import. Drop that line
  from `app_url.js` and every `/app/…` cold load opens the default app instead of the screen.
- **The router debounces `pushState`**: a JS probe right after a nav click reads the old URL. Wait a tick.
- **Stock's internal-link click guard only knows `/odoo`**: under `/app` an `<a href="/odoo/…">` click is a
  full page load. Not broken; just not in-app. The guard is a closure, not patchable.
- **`@http.route()` with no arguments cannot add a path** — repeat the parent's full list (done in `home.py`).
- **`web.web_app_name`** is where the PWA name comes from; its icons and `scope` are still odoo's.
- **The bootstrap script has never run.** `bash -n` only. Read its output carefully the first time;
  `certbot --nginx` and the `--without-demo` init are the two steps most likely to need a hand.
- **Deploy branch is `19.0`**, but the box will be bootstrapped from the feature branch: until Stefan
  merges, nothing auto-deploys, and the first push to `19.0` must contain the module or the site goes blank.
- Auto mode classifier blocks: `gh secret set`, `git push` (sometimes), the `document.cookie` session plant.
- Everything in the 2026-09-09 landmines still holds (auth recipe, first-load storage error, `--` in
  template comments, Sass `min()`, prepend-not-append in the `_assets_*` bundles).

## Environment / setup
- Run: `.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons --dev=xml
  --http-port=8069 --log-level=warn -u strataflow_workorder` after any Python/XML/JS change.
- Prod layout is in `deploy/README.md`.
- Git identity is repo-local `Stefan Djordjevic <dev@authex.co>`.

## Open decisions
1. **`/app` as the prefix** — my pick, unasked. `/desk`-at-root was rejected on 2026-09-08 for router
   reasons; any other single word is a one-line change in `app_url.js` + `home.py` + the nginx file.
2. **Demo data on the production DB?** Bootstrap defaults to none; `WITH_DEMO=1` seeds it.
3. **Certbot email** defaults to `dev@authex.co` (`CERTBOT_EMAIL` to override).
4. Unchanged: initials on image avatars (no), theme toggle on stock pages (later), USP feed transport.
