#!/usr/bin/env bash
# =============================================================================
#  backup.sh — nightly PostgreSQL dump with 7-day rotation
#
#  Streams pg_dump straight out of the container and gzips it on the host, so
#  nothing large is ever written inside the 512M Postgres cgroup.
#
#  Install as a cron job (as the user that owns this checkout):
#      crontab -e
#      0 3 * * * /opt/NextJSeCommerce/scripts/backup.sh >> /var/log/medusa-backup.log 2>&1
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RETENTION_DAYS="${RETENTION_DAYS:-7}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT}/backups}"

[ -f .env ] || { echo "[backup] .env not found in ${ROOT}" >&2; exit 1; }
set -a; . ./.env; set +a

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y-%m-%d_%H%M%S)"
TARGET="${BACKUP_DIR}/${POSTGRES_DB}_${STAMP}.sql.gz"

echo "[backup] $(date -Is) dumping ${POSTGRES_DB} -> ${TARGET}"

# --clean --if-exists makes the dump self-contained: restoring it into a
# populated database drops the old objects first instead of erroring out.
docker compose exec -T postgres \
	pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner \
	| gzip -9 > "$TARGET"

# A truncated or empty dump is worse than no dump, because it looks like one.
if [ ! -s "$TARGET" ] || [ "$(stat -c%s "$TARGET")" -lt 1024 ]; then
	echo "[backup] FAILED: ${TARGET} is empty or implausibly small" >&2
	rm -f "$TARGET"
	exit 1
fi

echo "[backup] wrote $(du -h "$TARGET" | cut -f1)"

DELETED="$(find "$BACKUP_DIR" -name "${POSTGRES_DB}_*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)"
echo "[backup] rotated out ${DELETED} dump(s) older than ${RETENTION_DAYS} days"

# Uploaded product images live in a Docker volume, not in Postgres — a database
# dump alone is not a complete restore. Uncomment to include them:
# docker run --rm -v nextjs-ecommerce_medusa_uploads:/data:ro -v "$BACKUP_DIR":/backup \
#   alpine tar czf "/backup/uploads_${STAMP}.tar.gz" -C /data .
