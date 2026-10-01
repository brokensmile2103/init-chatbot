#!/usr/bin/env bash
# Prints everything needed to debug an installation. Usage: ./diagnose.sh
cd "$(dirname "$0")" || exit 1
set -a
# shellcheck disable=SC1091
. ./.env 2>/dev/null
set +a
PORT="${PORT:-8000}"
echo "--- init-chatbot service: $(systemctl is-active init-chatbot)"
echo "--- Local health check (127.0.0.1:${PORT}):"; curl -s --max-time 5 "http://127.0.0.1:${PORT}/health"; echo
if [ -n "${PUBLIC_URL:-}" ]; then
  echo "--- Public health check (${PUBLIC_URL}):"; curl -s --max-time 8 -w '  [HTTP %{http_code}]' "${PUBLIC_URL%/}/health"; echo
fi
echo "--- Web servers: nginx=$(systemctl is-active nginx 2>/dev/null) apache2=$(systemctl is-active apache2 2>/dev/null) caddy=$(systemctl is-active caddy 2>/dev/null)"
echo "--- Something listening on ports 80/443:"; sudo ss -tlnp 2>/dev/null | grep -E ':(80|443)\s' || echo "  nothing"
echo "--- Chatbot log:"; sudo journalctl -u init-chatbot -n 15 --no-pager
echo "--- Indexing log:"; tail -n 6 index.log reindex.log 2>/dev/null
