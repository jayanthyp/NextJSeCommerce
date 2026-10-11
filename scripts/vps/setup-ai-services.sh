#!/usr/bin/env bash
# =============================================================================
#  setup-ai-services.sh — one-time VPS setup for the agentic pipeline's two
#  side services (see docs/agentic-pipeline-vps.md):
#
#    OmniRoute  :20128  model gateway — free-tier combos, DeepSeek last
#    claude-mem :37777  cross-run memory (SQLite + Chroma)
#
#  Both listen on 127.0.0.1 ONLY. The agent workflow reaches them through an
#  SSH tunnel with the deploy key; nothing is opened to the internet.
#
#  Run ON THE VPS as the deploy user (the same VPS_USER deploy-vps.yml uses):
#    bash scripts/vps/setup-ai-services.sh                     # install/upgrade + start
#    bash scripts/vps/setup-ai-services.sh --memory-key <key>  # give claude-mem its OmniRoute key
#
#  Idempotent: re-running upgrades to the pinned versions and keeps existing
#  secrets (they are generated once, never rotated silently).
# =============================================================================
set -euo pipefail

OMNIROUTE_VERSION="${OMNIROUTE_VERSION:-3.8.51}"
CLAUDE_MEM_VERSION="${CLAUDE_MEM_VERSION:-13.35.0}"
OMNI_PORT=20128
MEM_PORT=37777
PREFIX="$HOME/.local"
OMNI_ENV="$HOME/.config/omniroute/omniroute.env"
MEM_SETTINGS="$HOME/.claude-mem/settings.json"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

# Merge KEY=VALUE pairs into claude-mem's settings.json (created if absent).
set_mem_settings() {
  mkdir -p "$(dirname "$MEM_SETTINGS")"
  node -e '
    const fs = require("fs"); const [file, ...pairs] = process.argv.slice(1);
    const s = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    for (const p of pairs) { const i = p.indexOf("="); s[p.slice(0, i)] = p.slice(i + 1); }
    fs.writeFileSync(file, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  ' "$MEM_SETTINGS" "$@"
  chmod 600 "$MEM_SETTINGS"
}

if [ "${1:-}" = "--memory-key" ]; then
  [ -n "${2:-}" ] || die "usage: $0 --memory-key <omniroute-api-key>"
  set_mem_settings "CLAUDE_MEM_OPENAI_COMPAT_API_KEY=$2"
  sudo systemctl restart claude-mem
  log "claude-mem now summarizes through OmniRoute (combo: sdlc-memory)"
  exit 0
fi

# --- prerequisites ----------------------------------------------------------
NODE_MAJOR_MINOR="$(node -p 'process.versions.node.split(".").slice(0,2).join(".")' 2>/dev/null || echo 0)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a===22&&b>=22||a>=24&&a<27?0:1)' 2>/dev/null || die \
  "OmniRoute needs Node >=22.22 (<23) or 24-26; found ${NODE_MAJOR_MINOR}. Install it, e.g.:
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs"

AVAILABLE_MB="$(free -m | awk '/^Mem:/ {print $7}')"
if [ "${AVAILABLE_MB:-0}" -lt 1400 ]; then
  log "WARNING: only ${AVAILABLE_MB}MB RAM available. These services are capped at 640M + 768M;"
  log "         check \`docker stats\` headroom for the store first (README: keep containers under 2.5G)."
fi

command -v bun >/dev/null || [ -x "$HOME/.bun/bin/bun" ] || { log "Installing Bun (claude-mem's runtime)"; curl -fsSL https://bun.sh/install | bash; }
BUN="$(command -v bun || echo "$HOME/.bun/bin/bun")"
command -v uv >/dev/null || [ -x "$HOME/.local/bin/uv" ] || { log "Installing uv (runs claude-mem's Chroma vector store)"; curl -LsSf https://astral.sh/uv/install.sh | sh; }

# --- packages (user prefix, no sudo npm) --------------------------------------
log "Installing omniroute@${OMNIROUTE_VERSION} and claude-mem@${CLAUDE_MEM_VERSION} into ${PREFIX}"
npm install -g --prefix "$PREFIX" "omniroute@${OMNIROUTE_VERSION}" "claude-mem@${CLAUDE_MEM_VERSION}"
MEM_WORKER="$PREFIX/lib/node_modules/claude-mem/plugin/scripts/worker-service.cjs"
[ -f "$MEM_WORKER" ] || die "claude-mem worker not found at $MEM_WORKER"

# --- OmniRoute config (secrets generated once) --------------------------------
if [ ! -f "$OMNI_ENV" ]; then
  log "Generating OmniRoute secrets in $OMNI_ENV"
  mkdir -p "$(dirname "$OMNI_ENV")" "$HOME/.omniroute"
  INITIAL_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=')"
  umask 077
  cat > "$OMNI_ENV" <<EOF
PORT=${OMNI_PORT}
# Loopback only, and an API key on every /v1/* call even so (defense in depth).
OMNIROUTE_SERVER_HOST=127.0.0.1
REQUIRE_API_KEY=true
NODE_ENV=production
DATA_DIR=$HOME/.omniroute
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
API_KEY_SECRET=$(openssl rand -hex 32)
INITIAL_PASSWORD=${INITIAL_PASSWORD}
OMNIROUTE_MEMORY_MB=384
EOF
  log "OmniRoute dashboard password: ${INITIAL_PASSWORD}  (also in $OMNI_ENV — change it after first login)"
fi
chmod 600 "$OMNI_ENV"

# --- claude-mem config ----------------------------------------------------------
# Summaries go through OmniRoute's free combo, so memory needs no paid key.
set_mem_settings \
  "CLAUDE_MEM_WORKER_HOST=127.0.0.1" \
  "CLAUDE_MEM_WORKER_PORT=${MEM_PORT}" \
  "CLAUDE_MEM_PROVIDER=openai-compatible" \
  "CLAUDE_MEM_OPENAI_COMPAT_PRESET=custom" \
  "CLAUDE_MEM_OPENAI_COMPAT_BASE_URL=http://127.0.0.1:${OMNI_PORT}/v1" \
  "CLAUDE_MEM_OPENAI_COMPAT_MODEL=sdlc-memory"

# --- systemd units ----------------------------------------------------------------
log "Installing systemd units (sudo)"
sudo tee /etc/systemd/system/omniroute.service >/dev/null <<EOF
[Unit]
Description=OmniRoute model gateway (agentic SDLC pipeline)
After=network-online.target
Wants=network-online.target

[Service]
User=$(id -un)
EnvironmentFile=${OMNI_ENV}
ExecStart=${PREFIX}/bin/omniroute serve --port ${OMNI_PORT} --no-open
Restart=on-failure
RestartSec=5
MemoryMax=640M

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/claude-mem.service >/dev/null <<EOF
[Unit]
Description=claude-mem worker (agentic SDLC pipeline memory)
After=network-online.target omniroute.service

[Service]
User=$(id -un)
Environment=PATH=$(dirname "$BUN"):${PREFIX}/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=CLAUDE_MEM_WORKER_HOST=127.0.0.1
Environment=CLAUDE_MEM_WORKER_PORT=${MEM_PORT}
Environment=CLAUDE_MEM_WORKER_AUTOSTART=false
ExecStart=${BUN} ${MEM_WORKER} --daemon
Restart=on-failure
RestartSec=5
MemoryMax=768M

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now omniroute.service claude-mem.service
sudo systemctl restart omniroute.service claude-mem.service

sleep 5
curl -fsS -o /dev/null "http://127.0.0.1:${MEM_PORT}/api/health" && log "claude-mem is up on 127.0.0.1:${MEM_PORT}" || log "claude-mem not answering yet — journalctl -u claude-mem -n 50"
curl -fsS -o /dev/null "http://127.0.0.1:${OMNI_PORT}/" && log "OmniRoute is up on 127.0.0.1:${OMNI_PORT}" || log "OmniRoute not answering yet — journalctl -u omniroute -n 50"

cat <<EOF

Next (from your own machine — see docs/agentic-pipeline-vps.md):
  1. ssh -L ${OMNI_PORT}:127.0.0.1:${OMNI_PORT} $(id -un)@<vps>   then open http://localhost:${OMNI_PORT}
  2. Connect providers, create the combos sdlc-orchestrator / sdlc-worker /
     sdlc-worker-light / sdlc-memory (free models first, DeepSeek last),
     and create two API keys.
  3. GitHub secret OMNIROUTE_API_KEY = key #1
     On the VPS: bash scripts/vps/setup-ai-services.sh --memory-key <key #2>
EOF
