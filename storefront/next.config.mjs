/**
 * Next.js configuration for the containerised Medusa storefront.
 *
 * Replaces the starter's next.config.js — scripts/bootstrap.sh removes that
 * file, because Next refuses to start when both variants are present.
 */

// --- build-time environment check -------------------------------------------
// NEXT_PUBLIC_* values are inlined into the client bundle during `next build`,
// so a missing publishable key produces a storefront that silently 401s at
// runtime. Fail the build instead.
const REQUIRED = ["NEXT_PUBLIC_MEDUSA_BACKEND_URL", "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY"]

const missing = REQUIRED.filter((key) => !process.env[key])
if (missing.length) {
  console.error(
    `\n  Missing required build-time environment variables:\n` +
      missing.map((key) => `    - ${key}`).join("\n") +
      `\n\n  The publishable key is created by the Medusa seed script, so the` +
      `\n  backend must be seeded before the storefront is built. See README.md\n`
  )
  process.exit(1)
}

const backendUrl = new URL(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL)

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits .next/standalone with a minimal server.js and only the traced
  // node_modules — the difference between a ~1GB image and a ~180MB one, and
  // what keeps the runtime process inside its 512M cap.
  output: "standalone",

  reactStrictMode: true,
  poweredByHeader: false,

  // Caddy already applies zstd/gzip at the edge; doing it twice just burns CPU
  // on a box that has 4 cores at most.
  compress: false,

  // Deployment builds happen on the VPS with no reviewer present. Template lint
  // and type noise should not be able to block a production deploy; run
  // `npm run lint` / `tsc --noEmit` locally instead.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  images: {
    // Image optimization runs sharp in-process, and each transform allocates
    // in proportion to the source dimensions. Inside a 512M cap that is the
    // most likely thing to trigger an OOM kill, so the surface is deliberately
    // narrow: four breakpoints instead of eight, webp only (avif costs several
    // times the CPU and memory), and a long cache TTL so a given variant is
    // produced once rather than on every cold request.
    //
    // If you serve pre-sized images and want sharp out of the picture
    // entirely, replace this whole block with `unoptimized: true`.
    deviceSizes: [640, 828, 1080, 1920],
    imageSizes: [256, 384],
    formats: ["image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,

    remotePatterns: [
      // Product images served by Medusa's File Local provider.
      {
        protocol: backendUrl.protocol.replace(":", ""),
        hostname: backendUrl.hostname,
        port: backendUrl.port || "",
        pathname: "/**",
      },
      // Images referenced by the official seed data.
      { protocol: "https", hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com" },
      { protocol: "https", hostname: "medusa-server-testing.s3.amazonaws.com" },
      { protocol: "https", hostname: "medusa-server-testing.s3.us-east-1.amazonaws.com" },
      // Local development against a host-run backend.
      { protocol: "http", hostname: "localhost", port: "9000" },
    ],
  },

  logging: {
    fetches: { fullUrl: false },
  },
}

export default nextConfig
