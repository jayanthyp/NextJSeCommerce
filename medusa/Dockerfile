# =============================================================================
#  Medusa v2 backend — multi-stage build for a 4GB VPS
#
#  The important, non-obvious bit: `medusa build` does not produce a dist/ that
#  you run in place. It emits a SELF-CONTAINED SERVER PACKAGE at .medusa/server
#  with its own package.json, which needs its own production install. That
#  directory — not the source tree — is what ships in the final image.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: dependencies (full, including devDependencies — the build needs them)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app

# Toolchain for native addons compiled against musl.
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy only manifests first so this layer caches across source edits.
# The trailing * makes each lockfile optional — the starters have historically
# shipped either yarn.lock or package-lock.json depending on version.
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

RUN set -eux; \
    if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile --network-timeout 600000; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile; \
    else npm install --no-audit --no-fund; fi

# -----------------------------------------------------------------------------
# Stage 2: build server bundle + Admin dashboard
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat

# Bundling the Admin (Vite) is the memory-hungry step on this box. Cap V8's
# heap so it collects instead of ballooning into swap.
ENV NODE_OPTIONS=--max-old-space-size=1536
ENV NODE_ENV=production

# medusa-config.ts is evaluated during the build. It does not connect, but a
# syntactically valid URL must be present or config validation trips.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx medusa build

# The emitted server package gets its own production-only dependency tree.
WORKDIR /app/.medusa/server
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

# -----------------------------------------------------------------------------
# Stage 3: runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=9000

# wget (busybox) backs the compose healthcheck; curl is for manual debugging.
RUN apk add --no-cache curl tini

COPY --from=builder --chown=node:node /app/.medusa/server ./

# Mount point for the File Local provider. Creating it here with node ownership
# matters: Docker seeds a fresh named volume from the image directory, so a
# root-owned directory would produce an unwritable uploads volume.
RUN mkdir -p /app/static && chown -R node:node /app/static

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Defensive against CRLF endings introduced by editing on Windows.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
 && chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 9000

# tini reaps zombies and forwards SIGTERM, so `docker compose stop` is graceful.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
