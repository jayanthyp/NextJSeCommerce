#!/usr/bin/env bash
# =============================================================================
#  deploy.sh — VPS-side pull-and-restart, invoked by
#  .github/workflows/deploy-vps.yml over SSH after CI has built and pushed
#  fresh images to GHCR.
#
#  Deliberately does NOT build anything. The 4GB VPS spending its own RAM/CPU
#  compiling the Medusa Admin bundle and the Next.js build was always the
#  actual risk in this deployment (see the swap-file provisioning in
#  bootstrap.sh) — building once on GitHub's runners and shipping the
#  resulting image removes that risk from every deploy after this script
#  exists, not just the CI-triggered ones.
#
#  For a manual/local-style deploy that DOES build on the VPS itself (no CI,
#  matching the original `bootstrap.sh` workflow), use
#  `docker compose up -d --build` directly instead of this script.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

[ -f .env ] || { echo "[deploy] .env not found in ${ROOT} — run bootstrap.sh first" >&2; exit 1; }

log "Pulling latest source (compose file, Caddyfile, migrations, etc.)"
git pull --ff-only

log "Pulling pre-built images from GHCR"
docker compose pull backend storefront

log "Recreating containers with the new images"
docker compose up -d --remove-orphans

# Caddyfile is bind-mounted read-only into the caddy container. `up -d`
# only recreates a container when its image/env/labels change, not when a
# mounted file's *contents* change — so a Caddyfile-only edit would
# otherwise silently never take effect until caddy happened to restart for
# some unrelated reason (issue #129: a proxy route added weeks earlier was
# still not live because of exactly this). Restart it unconditionally on
# every deploy so the running config always matches what was just pulled.
log "Restarting caddy to pick up any Caddyfile changes"
docker compose restart caddy

log "Pruning dangling images to keep disk usage bounded"
docker image prune -f >/dev/null

log "Deploy complete"
docker compose ps
