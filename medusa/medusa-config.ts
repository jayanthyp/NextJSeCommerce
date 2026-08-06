import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379"

// Public origin of this backend. Two things depend on it being the *public*
// URL rather than the internal `http://backend:9000`:
//   1. the Admin dashboard's asset + API base URL, and
//   2. the URLs persisted for uploaded product images, which browsers fetch.
const BACKEND_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

// Email is optional. Without SMTP credentials we fall back to Medusa's local
// notification provider, which logs events instead of sending them — the store
// still works, you just read admin invites out of `docker compose logs`.
const SMTP_ENABLED = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS)

// Search is optional too. Without an admin key the plugin's loader throws at
// boot ("Meilisearch API key is missing"), which would otherwise take the
// whole app down just because search isn't configured yet — e.g. test/CI
// environments that never set MEILISEARCH_ADMIN_KEY, matching the
// storefront's own `searchEnabled` fallback for an unconfigured search key.
const MEILISEARCH_ENABLED = Boolean(process.env.MEILISEARCH_ADMIN_KEY)

// Google sign-in is optional too — the OAuth app is a manual step in the
// Google Cloud Console, so this stays off (email/password only) until real
// credentials exist. Once the `auth` module is configured at all, Medusa
// stops registering emailpass implicitly, so it has to be listed explicitly
// alongside google below.
const GOOGLE_AUTH_ENABLED = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
)

const authProviders = [
  { resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" },
  ...(GOOGLE_AUTH_ENABLED
    ? [
        {
          resolve: "@medusajs/medusa/auth-google",
          id: "google",
          options: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackUrl: `${process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"}/auth/customer/google/callback`,
          },
        },
      ]
    : []),
]

const emailProvider = SMTP_ENABLED
  ? {
      resolve: "./src/modules/smtp-notification",
      id: "smtp",
      options: {
        channels: ["email"],
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
      },
    }
  : {
      resolve: "@medusajs/medusa/notification-local",
      id: "local",
      options: {
        name: "Local Notification Provider",
        channels: ["email"],
      },
    }

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: REDIS_URL,

    // "shared": one process serves the API, the Admin and background jobs.
    // Splitting into server/worker would roughly double the RAM footprint,
    // which this host cannot afford.
    workerMode:
      (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") ||
      "shared",

    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET!,
      cookieSecret: process.env.COOKIE_SECRET!,
    },

    // Postgres is capped at max_connections=50 and shares the box with
    // everything else; keep Medusa's pool well under that.
    databaseDriverOptions: {
      pool: { min: 0, max: 10 },
    },

    // The Admin login session cookie's `secure` flag is otherwise forced true
    // whenever NODE_ENV=production (see @medusajs/framework's express-loader
    // resolveSessionCookieSecurity), which this container always sets — a
    // Secure cookie is silently refused by every browser unless the page is
    // actually served over HTTPS. That's correct behind Caddy in production,
    // but breaks Admin login outright for plain http://localhost:9000 local
    // development: /auth/session returns 200, but no cookie ever reaches the
    // browser, so the dashboard bounces back to the login screen on every
    // navigation. Deriving `secure` from the backend's own URL scheme keeps
    // production honest while fixing local dev.
    cookieOptions: {
      secure: BACKEND_URL.startsWith("https://"),
    },
  },

  admin: {
    // Bundled into this container and served at /app on the SAME origin as
    // the API — so backendUrl is deliberately left unset rather than baked
    // to BACKEND_URL. @medusajs/admin-bundler defaults an unset backendUrl
    // to "" (relative paths against whatever origin actually served /app),
    // which is what lets one built image work correctly behind localhost,
    // a Cloudflare tunnel, or the real VPS domain without a rebuild. Baking
    // in an absolute URL here previously meant the compiled Admin bundle
    // always tried to call back to whatever origin was set at BUILD time —
    // fine by coincidence when testing via localhost:9000 (the default),
    // broken ("Failed to fetch") the moment Admin was reached through any
    // other origin, since the browser would try to reach that OTHER
    // origin's own localhost:9000, not the tunnel/domain actually in use.
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
  },

  modules: [
    // --- Redis-backed infrastructure -----------------------------------------
    {
      resolve: "@medusajs/medusa/cache-redis",
      options: { redisUrl: REDIS_URL },
    },
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: { redisUrl: REDIS_URL },
    },
    {
      // Persists workflow state, so long-running workflows survive a restart.
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { url: REDIS_URL } },
    },

    // --- File storage ---------------------------------------------------------
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              // Relative to the working directory (/app), which is where the
              // `medusa_uploads` volume is mounted.
              upload_dir: "static",
              backend_url: `${BACKEND_URL}/static`,
            },
          },
        ],
      },
    },

    // --- Notifications --------------------------------------------------------
    {
      resolve: "@medusajs/medusa/notification",
      options: { providers: [emailProvider] },
    },

    // --- Auth -------------------------------------------------------------
    {
      resolve: "@medusajs/medusa/auth",
      options: { providers: authProviders },
    },

    // --- Site content -----------------------------------------------------
    { resolve: "./src/modules/homepage-carousel" },
    { resolve: "./src/modules/pages" },
    { resolve: "./src/modules/reviews" },
    { resolve: "./src/modules/wishlist" },

    // --- Retention & marketing --------------------------------------------
    { resolve: "./src/modules/abandoned-cart-tracking" },
    { resolve: "./src/modules/back-in-stock-request" },
    { resolve: "./src/modules/marketing-consent" },
  ],

  // Third-party packaged extensions (module + admin/api routes bundled
  // together) live here, separate from first-party `modules`.
  plugins: MEILISEARCH_ENABLED ? [
    {
      resolve: "@rokmohar/medusa-plugin-meilisearch",
      options: {
        config: {
          host: process.env.MEILISEARCH_HOST || "http://meilisearch:7700",
          // The plugin needs write access to index products, so this is the
          // master/admin key — never the search-only key exposed to the
          // storefront (that one lives purely in the storefront's own build
          // config, this backend never sees it).
          apiKey: process.env.MEILISEARCH_ADMIN_KEY || "",
        },
        settings: {
          products: {
            type: "products",
            enabled: true,
            fields: [
              "id",
              "title",
              "description",
              "handle",
              "thumbnail",
              "collection_title",
              "variant_sku",
            ],
            indexSettings: {
              searchableAttributes: ["title", "description", "variant_sku"],
              displayedAttributes: [
                "id",
                "title",
                "description",
                "handle",
                "thumbnail",
              ],
              filterableAttributes: ["collection_title"],
            },
            primaryKey: "id",
          },
        },
      },
    },
  ] : [],
})
