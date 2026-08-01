import Medusa from "@medusajs/js-sdk"

/**
 * Medusa JS SDK instance, shared by Server Components, Server Actions and
 * Client Components.
 *
 * The starter resolves a single backend URL, which does not survive
 * containerisation: `MEDUSA_BACKEND_URL` is not a NEXT_PUBLIC_ variable, so it
 * is `undefined` in the browser bundle and the SDK falls back to localhost.
 * Splitting the two origins is what lets server-side traffic use internal
 * Docker DNS while the browser keeps using the public, TLS-terminated host.
 *
 *   server  -> http://backend:9000    (internal bridge network, no TLS, no Caddy)
 *   browser -> https://api.<domain>   (public, inlined at build time)
 *
 * bootstrap.sh preserves the upstream version at
 * .templates/storefront/src/lib/config.ts if you need to diff after a template
 * upgrade.
 */
const PUBLIC_BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

const MEDUSA_BACKEND_URL =
  typeof window === "undefined"
    ? process.env.MEDUSA_BACKEND_URL || PUBLIC_BACKEND_URL
    : PUBLIC_BACKEND_URL

export const sdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})
