#!/usr/bin/env bash
# Run by cron: refreshes the index from WordPress and fills in missing embeddings.
# The running app reloads the index by itself, so no restart is needed.
cd "$(dirname "$0")" || exit 1
set -a
# shellcheck disable=SC1091
. ./.env
set +a
[ "$(stat -c%s reindex.log 2>/dev/null || echo 0)" -gt 1048576 ] && : > reindex.log
echo "=== $(date -u '+%F %T') UTC ===" >> reindex.log
./venv/bin/python index.py >> reindex.log 2>&1
