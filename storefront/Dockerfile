# =============================================================================
#  Next.js App Router storefront — multi-stage build for a 4GB VPS
#
#  Uses `output: "standalone"` (see next.config.mjs): Next traces the modules
#  the server actually imports and emits a self-contained server.js, so the
#  runtime image carries neither devDependencies nor the full node_modules tree.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

RUN set -eux; \
    if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile --network-timeout 600000; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile; \
    else npm install --no-audit --no-fund; fi

# -----------------------------------------------------------------------------
# Stage 2: build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat

# NEXT_PUBLIC_* values are inlined into the client bundle here, at build time.
# They cannot be supplied later as container environment variables — changing
# any of them requires `docker compose build --no-cache storefront`.
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_DEFAULT_REGION=dk
ARG NEXT_PUBLIC_GA4_MEASUREMENT_ID=
ARG NEXT_PUBLIC_SEARCH_ENDPOINT=
ARG NEXT_PUBLIC_SEARCH_API_KEY=
ARG NEXT_PUBLIC_SEARCH_INDEX_NAME=products
ARG NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false

# The starter's products/categories/collections routes shipped with
# generateStaticParams, which both (a) fetches from Medusa during `next
# build` — impossible anyway, since a plain `docker build` runs in an
# isolated network namespace with no route to a running `backend` container
# (Docker Desktop's default builder rejects a custom `build.network`
# outright) — and (b) conflicts with those same pages' unconditional
# `searchParams` reads: a route can't declare static intent via
# generateStaticParams AND read a Next.js "dynamic API" like searchParams in
# the same render without throwing DYNAMIC_SERVER_USAGE (a 500 on every
# request). generateStaticParams was removed from all three page files for
# this reason — every product/category/collection page now renders
# dynamically per-request against the live backend, which is also the
# correct behavior for a catalog that changes via Admin/seed without a
# storefront rebuild.
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_PUBLIC_DEFAULT_REGION=$NEXT_PUBLIC_DEFAULT_REGION \
    NEXT_PUBLIC_GA4_MEASUREMENT_ID=$NEXT_PUBLIC_GA4_MEASUREMENT_ID \
    NEXT_PUBLIC_SEARCH_ENDPOINT=$NEXT_PUBLIC_SEARCH_ENDPOINT \
    NEXT_PUBLIC_SEARCH_API_KEY=$NEXT_PUBLIC_SEARCH_API_KEY \
    NEXT_PUBLIC_SEARCH_INDEX_NAME=$NEXT_PUBLIC_SEARCH_INDEX_NAME \
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=$NEXT_PUBLIC_GOOGLE_AUTH_ENABLED \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# Keep V8 under the host's spare capacity — the compiler is the peak memory
# consumer on this box, not the running server.
ENV NODE_OPTIONS=--max-old-space-size=1536

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# libc6-compat is cheap insurance for sharp's musl binary, which Next's image
# optimizer loads out of the traced standalone bundle.
RUN apk add --no-cache tini libc6-compat

# Static assets and the public directory are not part of the traced output and
# must be copied alongside it.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
