#!/usr/bin/env bash
# =============================================================================
#  restore.sh — restore a dump produced by backup.sh
#
#      ./scripts/restore.sh backups/medusa_2026-08-01_030000.sql.gz
#
#  This DESTROYS the current database contents. The dump was taken with
#  --clean --if-exists, so it drops existing objects before recreating them.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DUMP="${1:-}"
[ -n "$DUMP" ] || { echo "usage: $0 <dump.sql.gz>" >&2; exit 1; }
[ -f "$DUMP" ]  || { echo "no such file: $DUMP" >&2; exit 1; }

[ -f .env ] || { echo "[restore] .env not found in ${ROOT}" >&2; exit 1; }
set -a; . ./.env; set +a

cat >&2 <<EOF

  About to restore:  ${DUMP}
  Into database:     ${POSTGRES_DB} (user ${POSTGRES_USER})

  Every row currently in that database will be replaced.

EOF

if [ "${FORCE:-0}" != "1" ]; then
	read -rp "Type the database name to confirm: " CONFIRM
	[ "$CONFIRM" = "$POSTGRES_DB" ] || { echo "[restore] aborted" >&2; exit 1; }
fi

# Stop the app so nothing writes mid-restore; Postgres itself stays up.
echo "[restore] stopping backend and storefront"
docker compose stop backend storefront || true

echo "[restore] restoring..."
gunzip -c "$DUMP" | docker compose exec -T postgres \
	psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --quiet

echo "[restore] restarting services"
docker compose start backend storefront

echo "[restore] done — the backend will re-run migrations on boot, which is"
echo "[restore] how a dump from an older schema gets brought up to date."
