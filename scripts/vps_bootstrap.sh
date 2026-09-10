#!/usr/bin/env bash
# One-time server setup for StrataFlow on Ubuntu 24.04. Written for a shared box (74.208.133.70 also
# runs map-sys behind nginx + certbot, with ufw locked to Cloudflare): it never touches an active ufw,
# never overwrites an existing cloudflare-realip.conf, and uses whatever postgres cluster is there.
# Run as root ON the VPS:
#
#   curl -fsSL https://raw.githubusercontent.com/authexinc/strataflow/19.0/scripts/vps_bootstrap.sh \
#     | DEPLOY_PUBKEY='ssh-ed25519 AAAA… github-actions-deploy strataflow' bash
#
# Environment (all optional):
#   BRANCH          branch to check out first (default 19.0; auto-deploy tracks 19.0 regardless)
#   DEPLOY_PUBKEY   public half of the GitHub Actions deploy key; installed in
#                   /root/.ssh/authorized_keys pinned to scripts/vps_deploy.sh (forced command)
#   CERTBOT_EMAIL   expiry notices for the TLS certificate (default dev@authex.co)
#   WITH_DEMO=1     load Odoo demo data into the new database (default: no)
#
# Idempotent where it matters: re-running skips the clone, the database and the certificate
# when they already exist, and reinstalls the config, unit and nginx site.
set -euo pipefail

BRANCH=${BRANCH:-19.0}
DOMAIN=flow.strataline.co
REPO_URL=https://github.com/authexinc/strataflow.git
REPO=/opt/strataflow
CERTBOT_EMAIL=${CERTBOT_EMAIL:-dev@authex.co}

echo "== packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q git python3 python3-venv python3-dev build-essential \
  libpq-dev libldap2-dev libsasl2-dev libssl-dev libjpeg-dev zlib1g-dev \
  libxml2-dev libxslt1-dev libffi-dev \
  postgresql nginx certbot python3-certbot-nginx wkhtmltopdf fonts-dejavu-core ufw

echo "== user and directories"
id -u strataflow >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/strataflow --shell /bin/bash strataflow
install -d -o strataflow -g strataflow -m 750 "$REPO" /var/lib/strataflow /var/log/strataflow
install -d -o root -g strataflow -m 750 /etc/strataflow

echo "== code"
if [ ! -d "$REPO/.git" ]; then
  runuser -u strataflow -- git clone -q --branch "$BRANCH" "$REPO_URL" "$REPO"
fi
cd "$REPO"
runuser -u strataflow -- git -C "$REPO" config user.name "Stefan Djordjevic"
runuser -u strataflow -- git -C "$REPO" config user.email "dev@authex.co"
if [ ! -x "$REPO/.venv/bin/python" ]; then
  runuser -u strataflow -- python3 -m venv "$REPO/.venv"
fi
runuser -u strataflow -- "$REPO/.venv/bin/pip" install -q --upgrade pip wheel
runuser -u strataflow -- "$REPO/.venv/bin/pip" install -q -r "$REPO/requirements.txt"

echo "== postgres"
PGPORT=$(pg_lsclusters -h | awk '$4=="online"{print $3; exit}')
[ -n "$PGPORT" ] || { echo "no online postgres cluster"; exit 1; }
export PGPORT
echo "cluster port $PGPORT"
runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='strataflow'" | grep -q 1 \
  || runuser -u postgres -- createuser strataflow
DB_EXISTS=$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='strataflow'" || true)
[ "$DB_EXISTS" = "1" ] || runuser -u postgres -- createdb -O strataflow strataflow

echo "== config"
if [ ! -f /etc/strataflow/odoo.conf ]; then
  ADMIN_PASSWD=$(openssl rand -base64 30)
  sed -e "s|__ADMIN_PASSWD__|$ADMIN_PASSWD|" -e "s|__PGPORT__|$PGPORT|" "$REPO/deploy/odoo.conf" > /etc/strataflow/odoo.conf
  printf '%s\n' "$ADMIN_PASSWD" > /root/strataflow-admin-passwd
  chmod 600 /root/strataflow-admin-passwd
  echo "master password written to /root/strataflow-admin-passwd"
fi
chown root:strataflow /etc/strataflow/odoo.conf
chmod 640 /etc/strataflow/odoo.conf

# initialise when the database has no Odoo tables yet (a previous run may have created it empty)
INITIALISED=$(runuser -u strataflow -- psql -d strataflow -tAc "SELECT 1 FROM pg_tables WHERE tablename='ir_module_module'" || true)
if [ "$INITIALISED" != "1" ]; then
  echo "== initialise database (demo: ${WITH_DEMO:-no})"
  DEMO_FLAG=--without-demo
  [ -n "${WITH_DEMO:-}" ] && DEMO_FLAG=--with-demo
  runuser -u strataflow -- "$REPO/.venv/bin/python" "$REPO/odoo-bin" -c /etc/strataflow/odoo.conf \
    -i strataflow_workorder $DEMO_FLAG --stop-after-init --log-level=warn
fi

echo "== service"
install -m 644 "$REPO/deploy/strataflow.service" /etc/systemd/system/strataflow.service
systemctl daemon-reload
systemctl enable -q strataflow
systemctl restart strataflow
sleep 3
systemctl is-active strataflow

echo "== nginx"
# Cloudflare edge ranges -> real visitor IP. map-sys ships the same file; keep theirs when present.
if [ ! -f /etc/nginx/conf.d/cloudflare-realip.conf ]; then
{
  echo "# generated $(date -u +%F) by scripts/vps_bootstrap.sh from cloudflare.com/ips-v4 + ips-v6"
  for r in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
    echo "set_real_ip_from $r;"
  done
  echo "real_ip_header CF-Connecting-IP;"
} > /etc/nginx/conf.d/cloudflare-realip.conf
fi
install -m 644 "$REPO/deploy/nginx/$DOMAIN" "/etc/nginx/sites-available/$DOMAIN"
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "== firewall"
if ufw status | grep -q "Status: active"; then
  echo "ufw already active - left alone (on the map-sys box 80/443 are Cloudflare-only on purpose)"
else
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow 22/tcp comment ssh >/dev/null
  ufw allow 80,443/tcp comment web >/dev/null
  ufw --force enable >/dev/null
fi

echo "== tls"
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect \
    || echo "WARN: certbot failed - is $DOMAIN pointed at this box and proxied through Cloudflare? Re-run this script once it is."
fi

if [ -n "${DEPLOY_PUBKEY:-}" ]; then
  echo "== deploy key"
  install -d -m 700 /root/.ssh
  touch /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys
  grep -qF "$DEPLOY_PUBKEY" /root/.ssh/authorized_keys || \
    echo "command=\"$REPO/scripts/vps_deploy.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $DEPLOY_PUBKEY" \
    >> /root/.ssh/authorized_keys
fi

echo "== verify"
curl -s -o /dev/null -w "http://127.0.0.1:8069/web/login -> %{http_code}\n" -m 15 http://127.0.0.1:8069/web/login
curl -s -o /dev/null -w "https://$DOMAIN/ -> %{http_code} %{redirect_url}\n" -m 15 "https://$DOMAIN/" || true
echo "done. Sign in at https://$DOMAIN/ as admin/admin and change the password."
