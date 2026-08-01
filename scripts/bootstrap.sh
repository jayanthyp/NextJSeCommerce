#!/usr/bin/env bash
# =============================================================================
#  bootstrap.sh — one-time server preparation
#
#  Run this on the VPS, from the repository root, before the first
#  `docker compose up`. It is idempotent: re-running skips anything already
#  done and never overwrites an existing .env.
#
#  What it does:
#    1. verifies docker / git / openssl
#    2. provisions a 4GB swapfile (image builds are the memory risk, not
#       steady-state serving)
#    3. clones the official Medusa + Next.js starters into .templates/
#    4. merges them into medusa/ and storefront/ WITHOUT clobbering the
#       deployment overrides committed in this repo
#    5. adds nodemailer to the Medusa project and refreshes its lockfile
#    6. generates .env with freshly-random secrets
#
#  Usage:
#    ./scripts/bootstrap.sh --domain example.com --api api.example.com \
#                           --email you@example.com
#    ./scripts/bootstrap.sh            # prompts for the three values
#    ./scripts/bootstrap.sh --local    # localhost .env, no swap, no prompts
#
#  Flags:
#    --domain <apex>     storefront apex domain
#    --api <host>        backend/admin hostname (default: api.<apex>)
#    --email <address>   ACME registration address for Let's Encrypt
#    --local             development machine: write a localhost .env and skip
#                        swap. Works on Windows under Git Bash.
#    --skip-swap         do not touch swap (use on a host that already has it)
#    --skip-clone        do not re-clone the upstream starters
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MEDUSA_REPO="https://github.com/medusajs/medusa-starter-default.git"
STORE_REPO="https://github.com/medusajs/nextjs-starter-medusa.git"
SWAP_FILE="/swapfile"
SWAP_SIZE="4G"

STORE_DOMAIN=""
API_DOMAIN=""
ACME_EMAIL=""
SKIP_SWAP=0
SKIP_CLONE=0
LOCAL=0

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

# --- arguments ---------------------------------------------------------------
while [ $# -gt 0 ]; do
	case "$1" in
		--domain) STORE_DOMAIN="${2:?}"; shift 2 ;;
		--api)    API_DOMAIN="${2:?}";   shift 2 ;;
		--email)  ACME_EMAIL="${2:?}";   shift 2 ;;
		--local)  LOCAL=1; SKIP_SWAP=1;  shift ;;
		--skip-swap)  SKIP_SWAP=1;  shift ;;
		--skip-clone) SKIP_CLONE=1; shift ;;
		-h|--help) sed -n '2,30p' "$0"; exit 0 ;;
		*) die "unknown flag: $1" ;;
	esac
done

# --- 1. prerequisites --------------------------------------------------------
log "Checking prerequisites"
for bin in docker git openssl; do
	command -v "$bin" >/dev/null 2>&1 || die "$bin is not installed"
done
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is not installed"

# --- 2. swap -----------------------------------------------------------------
# The stack idles around 1.5GB, but `docker compose build` peaks far higher:
# bundling the Medusa Admin and compiling Next.js are both heavy. Swap is
# insurance against an OOM kill mid-build; it should stay near-untouched at rest.
if [ "$SKIP_SWAP" -eq 0 ]; then
	if swapon --show 2>/dev/null | grep -q .; then
		log "Swap already active — skipping"
	elif [ "$(id -u)" -ne 0 ]; then
		warn "Not running as root; skipping swap setup. Re-run with sudo, or use --skip-swap."
	else
		log "Creating ${SWAP_SIZE} swapfile at ${SWAP_FILE}"
		fallocate -l "$SWAP_SIZE" "$SWAP_FILE" || dd if=/dev/zero of="$SWAP_FILE" bs=1M count=4096
		chmod 600 "$SWAP_FILE"
		mkswap "$SWAP_FILE"
		swapon "$SWAP_FILE"
		grep -q "^${SWAP_FILE}" /etc/fstab || echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
		# Prefer RAM; only fall back to swap under genuine pressure.
		sysctl -w vm.swappiness=10 >/dev/null
		grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
		log "Swap enabled: $(swapon --show --noheadings | head -1)"
	fi
fi

# --- 3. clone upstream starters ---------------------------------------------
if [ "$SKIP_CLONE" -eq 0 ]; then
	log "Cloning upstream starters into .templates/"
	rm -rf .templates
	mkdir -p .templates
	git clone --depth 1 "$MEDUSA_REPO" .templates/medusa
	git clone --depth 1 "$STORE_REPO"  .templates/storefront
	rm -rf .templates/medusa/.git .templates/storefront/.git
else
	[ -d .templates ] || die "--skip-clone given but .templates/ does not exist"
fi

# --- 4. merge templates under the deployment overrides -----------------------
# `cp -n` (no-clobber) is the whole trick: files this repo already provides —
# Dockerfile, medusa-config.ts, next.config.mjs, src/lib/config.ts, the SMTP
# module — win, and everything else comes from upstream.
log "Merging templates (existing files are preserved)"
mkdir -p medusa storefront
cp -Rn .templates/medusa/.     medusa/
cp -Rn .templates/storefront/. storefront/

# Next refuses to boot with two config files present.
for stale in storefront/next.config.js storefront/next.config.ts; do
	if [ -f "$stale" ]; then
		log "Removing $stale (superseded by next.config.mjs)"
		rm -f "$stale"
	fi
done

# --- 5. add missing dependencies and refresh the lockfiles -------------------
# Done inside containers so the host needs no Node toolchain.
#
# The lockfile must be regenerated in the same step: adding a dependency
# without it would make `npm ci` in the Dockerfile fail on a lock/manifest
# mismatch. Both projects are then standardised on npm so each Dockerfile takes
# one deterministic install path.
npm_in() {
	local dir="$1"; shift
	# Cache is bind-mounted from the host rather than left at the container's
	# own /tmp: each `docker run` here is a fresh container, so an internal
	# cache path is wiped between calls and every install re-hits the
	# registry from nothing. Observed cost of that: a single lockfile refresh
	# taking 20 minutes and then hitting npm's 429 rate limit outright.
	mkdir -p "${ROOT}/.npm-cache"
	# MSYS_NO_PATHCONV stops Git Bash on Windows from rewriting the container
	# paths (-w /app becomes C:/Program Files/Git/app without it). Harmless
	# elsewhere — on Linux and macOS the variable is simply unused.
	MSYS_NO_PATHCONV=1 docker run --rm \
		--user "$(id -u):$(id -g)" \
		-e npm_config_cache=/npm-cache \
		-e npm_config_fetch_retries=5 \
		-e npm_config_fetch_retry_maxtimeout=120000 \
		-v "${ROOT}/${dir}":/app -w /app \
		-v "${ROOT}/.npm-cache":/npm-cache \
		node:20-alpine sh -c "$*"
}

log "Adding nodemailer to the Medusa project"
npm_in medusa "
	npm pkg set dependencies.nodemailer='^6.9.14' &&
	npm pkg set devDependencies.'@types/nodemailer'='^6.4.15' &&
	npm install --package-lock-only --no-audit --no-fund
"
rm -f medusa/yarn.lock medusa/pnpm-lock.yaml

# sharp is not a declared dependency of the starter, but Next.js refuses to
# optimise images in standalone output without it — the storefront would build
# cleanly and then 500 on every <Image>. Installing on alpine here is what
# pulls the linux-musl binary rather than a glibc one.
log "Adding sharp to the storefront project"
npm_in storefront "
	npm pkg set dependencies.sharp='^0.33.5' &&
	npm install --package-lock-only --no-audit --no-fund
"
rm -f storefront/yarn.lock storefront/pnpm-lock.yaml

# --- 6. environment ----------------------------------------------------------
if [ -f .env ]; then
	log ".env already exists — leaving it untouched"
else
	set_env() {
		local key="$1" val="$2"
		if grep -q "^${key}=" .env; then
			sed -i "s|^${key}=.*|${key}=${val}|" .env
		else
			printf '%s=%s\n' "$key" "$val" >> .env
		fi
	}

	if [ "$LOCAL" -eq 1 ]; then
		log "Generating .env for local development (http://localhost)"
		cp .env.example .env

		# Domains are unused locally — Caddy is parked behind a profile in
		# docker-compose.local.yml — but Compose still interpolates them, so
		# they need values.
		set_env STORE_DOMAIN "localhost"
		set_env API_DOMAIN   "localhost"
		set_env ACME_EMAIL   "dev@localhost"

		# Ports, not hostnames, are what separate the two apps locally.
		set_env MEDUSA_BACKEND_URL "http://localhost:9000"
		set_env STORE_CORS "http://localhost:3000,http://localhost:8000"
		set_env ADMIN_CORS "http://localhost:9000,http://localhost:5173"
		set_env AUTH_CORS  "http://localhost:3000,http://localhost:9000"

		set_env NEXT_PUBLIC_MEDUSA_BACKEND_URL "http://localhost:9000"
		set_env NEXT_PUBLIC_BASE_URL           "http://localhost:3000"
	else
		[ -n "$STORE_DOMAIN" ] || read -rp "Storefront apex domain (e.g. example.com): " STORE_DOMAIN
		[ -n "$STORE_DOMAIN" ] || die "a storefront domain is required"
		[ -n "$API_DOMAIN" ]   || read -rp "Backend domain [api.${STORE_DOMAIN}]: " API_DOMAIN
		API_DOMAIN="${API_DOMAIN:-api.${STORE_DOMAIN}}"
		[ -n "$ACME_EMAIL" ]   || read -rp "Email for Let's Encrypt: " ACME_EMAIL
		[ -n "$ACME_EMAIL" ]   || die "an ACME email is required"

		log "Generating .env"
		cp .env.example .env

		set_env STORE_DOMAIN "$STORE_DOMAIN"
		set_env API_DOMAIN   "$API_DOMAIN"
		set_env ACME_EMAIL   "$ACME_EMAIL"

		set_env MEDUSA_BACKEND_URL "https://${API_DOMAIN}"
		set_env STORE_CORS "https://${STORE_DOMAIN},https://www.${STORE_DOMAIN}"
		set_env ADMIN_CORS "https://${API_DOMAIN}"
		set_env AUTH_CORS  "https://${STORE_DOMAIN},https://www.${STORE_DOMAIN},https://${API_DOMAIN}"

		set_env NEXT_PUBLIC_MEDUSA_BACKEND_URL "https://${API_DOMAIN}"
		set_env NEXT_PUBLIC_BASE_URL           "https://${STORE_DOMAIN}"
	fi

	# Hex rather than base64 on purpose: no '$', '/' or '=' to be mangled by
	# compose interpolation, shell sourcing, or the DATABASE_URL that
	# docker-compose.yml builds from POSTGRES_PASSWORD.
	sed -i "s|CHANGEME_POSTGRES_PASSWORD|$(openssl rand -hex 24)|" .env
	sed -i "s|CHANGEME_JWT_SECRET|$(openssl rand -hex 32)|"        .env
	sed -i "s|CHANGEME_COOKIE_SECRET|$(openssl rand -hex 32)|"     .env
	sed -i "s|CHANGEME_REVALIDATE_SECRET|$(openssl rand -hex 16)|" .env

	chmod 600 .env
	log ".env written with generated secrets (mode 600)"
fi

# --- 7. line endings ---------------------------------------------------------
# These files may have been authored on Windows; CRLF makes the Linux kernel
# reject the shebang with a misleading "no such file or directory".
log "Normalising shell script line endings"
find scripts medusa -maxdepth 2 -name '*.sh' -type f -exec sed -i 's/\r$//' {} +
chmod +x scripts/*.sh medusa/docker-entrypoint.sh 2>/dev/null || true

# --- done --------------------------------------------------------------------
cat <<EOF

$(log "Bootstrap complete")

  Overrides applied on top of the upstream starters:
    medusa/Dockerfile
    medusa/docker-entrypoint.sh
    medusa/medusa-config.ts
    medusa/src/modules/smtp-notification/
    medusa/src/subscribers/order-placed.ts
    storefront/Dockerfile
    storefront/next.config.mjs
    storefront/src/lib/config.ts

  Upstream originals are kept in .templates/ for diffing after an upgrade.
EOF

if [ "$LOCAL" -eq 1 ]; then
	cat <<'EOF'
  Next (local — note the two -f flags on every command):

    C=("-f" "docker-compose.yml" "-f" "docker-compose.local.yml")

    docker compose "${C[@]}" up -d --build postgres redis backend
    docker compose "${C[@]}" exec backend npx medusa exec ./src/scripts/seed.js
    docker compose "${C[@]}" exec backend npx medusa user -e admin@local.test -p supersecret
    ./scripts/get-publishable-key.sh --write
    docker compose "${C[@]}" up -d --build storefront

    storefront  http://localhost:3000
    admin       http://localhost:9000/app

  The storefront is built LAST on purpose: the publishable key is compiled
  into its JavaScript bundle, and it does not exist until the seed has run.

EOF
else
	cat <<EOF
  Next:
    1. Review .env — especially SMTP_USER / SMTP_PASS (Gmail App Password).
    2. Confirm DNS: ${STORE_DOMAIN:-<apex>}, www.${STORE_DOMAIN:-<apex>} and
       ${API_DOMAIN:-<api>} must all resolve to this host.
    3. docker compose up -d --build postgres redis backend

  See README.md for the rest of the sequence — the storefront must be built
  AFTER the backend is seeded, because the publishable key is compiled into it.

EOF
fi
