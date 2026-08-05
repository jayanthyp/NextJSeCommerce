#!/usr/bin/env bash
# =============================================================================
#  get-search-key.sh — read MeiliSearch's auto-generated search-only key
#
#  MeiliSearch, on first boot with a master key set, auto-generates a
#  "Default Search API Key" (actions: ["search"]) alongside a "Default Admin
#  API Key". The storefront's browser-side search client must use the
#  search-only key — the master key stays backend-only for indexing (see
#  medusa-config.ts's meilisearch plugin options).
#
#      ./scripts/get-search-key.sh            # print the key
#      ./scripts/get-search-key.sh --write    # also write it into .env
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WRITE=0
[ "${1:-}" = "--write" ] && WRITE=1

[ -f .env ] || { echo "[key] .env not found in ${ROOT}" >&2; exit 1; }
set -a; . ./.env; set +a

[ -n "${MEILI_MASTER_KEY:-}" ] || { echo "[key] MEILI_MASTER_KEY not set in .env" >&2; exit 1; }

KEY="$(docker compose exec -T meilisearch wget -qO- \
	--header "Authorization: Bearer ${MEILI_MASTER_KEY}" \
	http://127.0.0.1:7700/keys \
	| node -pe 'JSON.parse(require("fs").readFileSync(0)).results.find(k => JSON.stringify(k.actions) === JSON.stringify(["search"])).key' \
	2>/dev/null || true)"

if [ -z "$KEY" ] || [ "$KEY" = "undefined" ]; then
	cat >&2 <<'EOF'
[key] Could not read the default search key.

      Make sure meilisearch is up:
        docker compose up -d meilisearch

      It generates default keys on first boot — give it a few seconds after
      first start, then retry.
EOF
	exit 1
fi

echo "$KEY"

if [ "$WRITE" -eq 1 ]; then
	if grep -q '^NEXT_PUBLIC_SEARCH_API_KEY=' .env; then
		sed -i "s|^NEXT_PUBLIC_SEARCH_API_KEY=.*|NEXT_PUBLIC_SEARCH_API_KEY=${KEY}|" .env
	else
		printf 'NEXT_PUBLIC_SEARCH_API_KEY=%s\n' "$KEY" >> .env
	fi
	echo "[key] written to .env" >&2
	echo "[key] rebuild the storefront for it to take effect:" >&2
	echo "[key]   docker compose build --no-cache storefront && docker compose up -d storefront" >&2
fi
