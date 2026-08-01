import { NextResponse } from "next/server"

/**
 * Container healthcheck target.
 *
 * Every other route in this app sits under `/[countryCode]` and is subject to
 * middleware.ts's region-redirect logic, which issues a 307 and expects the
 * client to carry a `_medusa_cache_id` cookie back on the next request. A
 * cookie-less HTTP client — which is exactly what `wget --spider` is — gets
 * redirected to the same URL forever and fails with "too many redirections",
 * even though the server is perfectly healthy.
 *
 * `/api/*` is explicitly excluded from middleware.ts's matcher, so this path
 * always returns directly. Do not move it under `/[countryCode]`.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" })
}
