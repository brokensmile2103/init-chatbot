#!/usr/bin/env bash
# Init Chatbot installer (Ubuntu/Debian). Run as a normal user that has sudo:  ./setup.sh
# It installs the app as a systemd service that listens on 127.0.0.1 only, and schedules re-indexing.
# It does NOT install or change any web server: connect yours (Nginx, Apache, Caddy...) with the configs written to ./webserver/
set -euo pipefail
cd "$(dirname "$0")"
APP_DIR="$(pwd)"; RUN_USER="$(id -un)"; SERVICE="init-chatbot"

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "Run this as a normal user with sudo access, not as root."
command -v sudo >/dev/null || die "sudo is required."
# shellcheck disable=SC1091
. /etc/os-release 2>/dev/null || true
case "${ID:-}" in ubuntu|debian) ;; *) die "Only Ubuntu/Debian are supported (found: ${ID:-unknown})." ;; esac

# ---------------------------------------------------------------- 1. configuration
sed -i 's/\r$//' ./*.sh ./*.py .env 2>/dev/null || true
[ -f .env ] || die "No .env file. Run:  cp env.example .env   then edit it (nano .env) and run ./setup.sh again."
set -a
# shellcheck disable=SC1091
. ./.env
set +a
REQUIRED="GEMINI_API_KEY ALLOWED_ORIGIN"
[ -n "${SITES:-}" ] || REQUIRED="$REQUIRED BLOG_URL"   # SITES replaces BLOG_URL for multi-site setups
for v in $REQUIRED; do
  val="${!v:-}"
  case "$val" in
    ""|*PASTE_YOUR*|*your-blog.example.com*) die "$v in .env is still a placeholder ('$val')." ;;
  esac
done
PORT="${PORT:-8000}"
FORWARDED="${FORWARDED_ALLOW_IPS:-127.0.0.1}"
if grep -qE '^[A-Z_]+=[^#]*[[:space:]]#' .env; then
  echo "WARNING: .env has a comment on the same line as a value. systemd may read it as part of the value. Put comments on their own line."
fi
chmod 700 "$APP_DIR"; chmod 600 .env; chmod 600 chatbot.db* answers.db* 2>/dev/null || true

# ---------------------------------------------------------------- 2. swap for small servers
say "Swap"
if ! swapon --show | grep -q . && [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 2048 ]; then
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  sudo chmod 600 /swapfile; sudo mkswap /swapfile >/dev/null; sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo "Created a 2 GB swap file."
else
  echo "Not needed."
fi

# ---------------------------------------------------------------- 3. packages
say "Packages"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-venv python3-pip curl cron

# ---------------------------------------------------------------- 4. application
say "Python environment"
[ -d venv ] || python3 -m venv venv
./venv/bin/pip install -q -r requirements.txt
./venv/bin/python -m py_compile app.py common.py db.py index.py
rm -rf __pycache__

say "Indexing your site (keyword index, no API calls)"
./venv/bin/python index.py --no-embed || die "Indexing failed. Fix the message above (usually BLOG_URL or a blocked WordPress REST API) and run ./setup.sh again."

# ---------------------------------------------------------------- 5. service
say "Service"
UNIT_FILE="/etc/systemd/system/${SERVICE}.service"
PREV_UNIT=""
if [ -f "$UNIT_FILE" ]; then   # keep the working service file so a failed upgrade can put it back
  mkdir -p .backup; PREV_UNIT=".backup/${SERVICE}.service.$(date +%s)"
  sudo cp -a "$UNIT_FILE" "$PREV_UNIT"
fi
sudo tee "$UNIT_FILE" >/dev/null <<UNIT
[Unit]
Description=Init Chatbot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${APP_DIR}/venv/bin/uvicorn app:app --host 127.0.0.1 --port ${PORT} --proxy-headers --forwarded-allow-ips=${FORWARDED} --no-server-header --no-access-log --timeout-keep-alive 15 --limit-concurrency 40
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${APP_DIR}
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
LockPersonality=true
MemoryMax=600M
TasksMax=200

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE" >/dev/null 2>&1
sudo systemctl restart "$SERVICE"
healthy=0
for _ in $(seq 1 20); do
  if curl -sf --max-time 3 "http://127.0.0.1:${PORT}/health" >/dev/null; then healthy=1; break; fi
  sleep 1
done
if [ "$healthy" != 1 ]; then
  sudo journalctl -u "$SERVICE" -n 20 --no-pager || true
  if [ -n "$PREV_UNIT" ]; then
    echo "Putting the previous service file back..."
    sudo install -m 644 "$PREV_UNIT" "$UNIT_FILE"
    sudo systemctl daemon-reload; sudo systemctl restart "$SERVICE" || true
    die "The service did not start with the new files; the previous service file was restored. If the log above points to the code or to .env, fix that and run ./setup.sh again."
  fi
  die "The service did not start. Read the log above."
fi
echo "Health check: $(curl -s --max-time 3 "http://127.0.0.1:${PORT}/health")"

# ---------------------------------------------------------------- 6. schedule + embeddings
say "Scheduled re-index (08:30 and 20:00 server time, UTC on most cloud images)"
chmod +x reindex.sh diagnose.sh
( crontab -l 2>/dev/null | grep -vF "$APP_DIR/reindex.sh" || true
  echo "30 8 * * * $APP_DIR/reindex.sh"
  echo "0 20 * * * $APP_DIR/reindex.sh" ) | crontab -

say "Embeddings (running in the background, safe to interrupt)"
nohup ./venv/bin/python index.py >> index.log 2>&1 &

# ---------------------------------------------------------------- 7. web server configs (written only; nothing is installed or changed)
say "Web server configs"
scheme="https"; host="chatbot.example.com"; path=""
case "${PUBLIC_URL:-}" in
  ""|*chatbot.example.com*) PUBLIC_SET=0 ;;
  *)
    PUBLIC_SET=1
    case "$PUBLIC_URL" in http://*) scheme="http" ;; esac
    rest="${PUBLIC_URL#*://}"; host="${rest%%/*}"
    case "$rest" in */*) path="/${rest#*/}"; path="${path%/}" ;; esac
    ;;
esac
if [ -n "$path" ]; then mode="subpath"; else mode="subdomain"; fi
render() {   # render <template> <output>
  sed -e "s|__HOST__|${host}|g" -e "s|__PORT__|${PORT}|g" -e "s|__PATH__|${path}|g" "webserver/templates/$1" > "webserver/$2"
}
render "nginx-${mode}.tpl" nginx.conf
render "apache-${mode}.tpl" apache.conf
render "caddy-${mode}.tpl" Caddyfile
echo "Wrote webserver/nginx.conf, webserver/apache.conf and webserver/Caddyfile (${mode} mode for ${host}${path})."
[ "$PUBLIC_SET" = 1 ] || echo "Tip: set PUBLIC_URL in .env (for example https://chatbot.your-blog.com or https://your-blog.com/chatbot) and run ./setup.sh again to fill in your own address."

# ---------------------------------------------------------------- 8. summary
echo
echo "Init Chatbot is running on 127.0.0.1:${PORT} (not public yet). It already answers using keyword search;"
echo "semantic search improves as the embeddings finish (tail -f ${APP_DIR}/index.log)."
echo
echo "NEXT: connect your web server. Pick the file for the server you use:"
if [ "$mode" = subdomain ]; then
  echo "  Nginx   sudo cp webserver/nginx.conf /etc/nginx/sites-available/init-chatbot && sudo ln -s /etc/nginx/sites-available/init-chatbot /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx"
  echo "          then HTTPS:  sudo certbot --nginx -d ${host}"
  echo "  Apache  see webserver/apache.conf (a2enmod proxy proxy_http, a2ensite, configtest, reload)"
  echo "  Caddy   add webserver/Caddyfile to your Caddyfile and reload Caddy"
else
  echo "  Nginx   paste webserver/nginx.conf inside your existing server { } block, then: sudo nginx -t && sudo systemctl reload nginx"
  echo "  Apache  paste webserver/apache.conf inside your existing <VirtualHost>, enable proxy + proxy_http, reload"
  echo "  Caddy   paste webserver/Caddyfile inside your existing site block, reload Caddy"
fi
echo
echo "Then add this to your site:  <script src=\"${scheme}://${host}${path}/widget.min.js\" defer></script>"
echo "Check it:  curl ${scheme}://${host}${path}/health      Troubleshooting:  ./diagnose.sh"
