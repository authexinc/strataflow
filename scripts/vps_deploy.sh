#!/usr/bin/env bash
# Server-side auto-deploy: runs ON the VPS as root, triggered by GitHub Actions
# (.github/workflows/deploy.yml) over SSH via a forced-command key.
#
# Contract:
# - git is the source of truth for code; the branch is /etc/strataflow/deploy_branch. /etc/strataflow/odoo.conf, the database and
#   /var/lib/strataflow (filestore) are never touched here.
# - every deploy updates the module (-u strataflow_workorder) with the service stopped,
#   then restarts it: Python, XML and asset changes all need it, and a plain restart can
#   serve a stale bundle. Expect ~30 s of downtime per deploy.
set -euo pipefail

REPO=/opt/strataflow
# the branch this box follows: written by vps_bootstrap.sh from BRANCH, edit to switch
BRANCH=$(cat /etc/strataflow/deploy_branch 2>/dev/null || echo 19.0)
as_app() { runuser -u strataflow -- "$@"; }

# every git call as the owner of the checkout: root is refused with "dubious ownership"
cd "$REPO"
OLD=$(as_app git rev-parse HEAD)
as_app git fetch -q origin "$BRANCH"
as_app git reset --hard -q "origin/$BRANCH"
NEW=$(as_app git rev-parse HEAD)

if [ "$OLD" = "$NEW" ]; then
  echo "already at $NEW - nothing to do"
  exit 0
fi
echo "deploying: $OLD -> $NEW"
as_app git log --oneline "$OLD..$NEW" 2>/dev/null || true

if as_app git diff --name-only "$OLD" "$NEW" -- requirements.txt | grep -q .; then
  echo "requirements.txt changed -> pip install"
  as_app "$REPO/.venv/bin/pip" install -q -r "$REPO/requirements.txt"
fi

systemctl stop strataflow
as_app "$REPO/.venv/bin/python" "$REPO/odoo-bin" -c /etc/strataflow/odoo.conf \
  -u strataflow_workorder --stop-after-init --log-level=warn
systemctl start strataflow
sleep 3
systemctl is-active strataflow

curl -s -o /dev/null -w "verify: /web/login -> %{http_code}\n" -m 30 http://127.0.0.1:8069/web/login
