#!/usr/bin/env bash
# =============================================================================
#  get-publishable-key.sh — read the storefront's publishable API key
#
#  The key is created by the Medusa seed script and is required by the
#  storefront build (it is inlined into the client bundle). This reads it
#  straight out of Postgres so you do not have to open the Admin UI before the
#  storefront exists.
#
#      ./scripts/get-publishable-key.sh            # print the key
#      ./scripts/get-publishable-key.sh --write    # also write it into .env
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WRITE=0
[ "${1:-}" = "--write" ] && WRITE=1

[ -f .env ] || { echo "[key] .env not found in ${ROOT}" >&2; exit 1; }
set -a; . ./.env; set +a

KEY="$(docker compose exec -T postgres \
	psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
	"select token from api_key where type = 'publishable' and revoked_at is null order by created_at limit 1;" \
	| tr -d '[:space:]')"

if [ -z "$KEY" ]; then
	cat >&2 <<'EOF'
[key] No publishable API key found.

      Seed the backend first:
        docker compose exec backend npx medusa exec ./src/scripts/seed.js

      Or create one in Admin -> Settings -> Publishable API Keys, then make
      sure it is linked to the sales channel your storefront reads from.
EOF
	exit 1
fi

echo "$KEY"

if [ "$WRITE" -eq 1 ]; then
	if grep -q '^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=' .env; then
		sed -i "s|^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=.*|NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${KEY}|" .env
	else
		printf 'NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=%s\n' "$KEY" >> .env
	fi
	echo "[key] written to .env" >&2
	echo "[key] rebuild the storefront for it to take effect:" >&2
	echo "[key]   docker compose build --no-cache storefront && docker compose up -d storefront" >&2
fi
