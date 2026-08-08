import { NextRequest, NextResponse } from "next/server"

import { sdk } from "@lib/config"
import { setAuthToken, consumeOAuthReturnRegion } from "@lib/data/cookies"
import { transferCart } from "@lib/data/customer"
import { getBaseURL } from "@lib/util/env"

// The actor-less token's payload carries Google's profile data in
// user_metadata (name/email/picture — confirmed by decoding a real one),
// which turns out to be the ONLY place this route has access to it: Google's
// redirect itself only carries `code`/`state`. Reading our own just-issued
// token's claims is fine — it's signed by our own backend, not something
// we're trusting from an untrusted source.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1]
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"))
  } catch {
    return null
  }
}

// Deliberately outside [countryCode] — see loginWithOAuth's comment for why.
// Lands on the region the visitor was actually browsing in before starting
// sign-in — loginWithOAuth stashes it in a short-lived cookie right before
// redirecting to Google, since Google's own redirect back here carries no
// room for it (just `code`/`state`). Falls back to
// NEXT_PUBLIC_DEFAULT_REGION if that cookie is missing (e.g. an old
// in-flight sign-in from before this existed) — an invalid/stale region in
// either case just gets corrected by middleware.ts's own region resolution
// on the next request, so no validation is needed here.
export async function GET(request: NextRequest) {
  const defaultRegion =
    (await consumeOAuthReturnRegion()) ||
    process.env.NEXT_PUBLIC_DEFAULT_REGION ||
    "us"
  const query = Object.fromEntries(request.nextUrl.searchParams.entries())
  // Built from NEXT_PUBLIC_BASE_URL (same helper sitemap.ts/product-jsonld
  // use), not request.url — behind the standalone Next.js server, the
  // latter can reflect the container's internal bind address rather than
  // the real public host, sending the browser to an unreachable URL.
  const baseUrl = getBaseURL()

  try {
    const result = await sdk.auth.callback("customer", "google", query)

    if (typeof result !== "string") {
      // MFA/verification-required responses aren't expected for a
      // first-party OAuth provider like Google; treat as a hard failure
      // rather than silently mishandling an unsupported multi-step flow.
      throw new Error("Unexpected multi-step auth response from Google callback")
    }

    // Threaded through a local variable and passed explicitly to every
    // call below, rather than round-tripping through setAuthToken() +
    // getAuthHeaders() mid-request — a Route Handler's cookies() may not
    // reflect a same-request mutation the same way a Server Action's does
    // (the emailpass register flow relies on that working, but it's a
    // Server Action, not a Route Handler; not worth trusting here). Only
    // one cookies().set() happens at all, right before returning.
    let token = result

    // First-time Google sign-in returns an actor-less token (no linked
    // Customer yet) — create one. Unlike the emailpass flow, there's no
    // form data to pull email/name from, so it comes from the token's own
    // user_metadata claim (see decodeJwtPayload above). POST /store/
    // customers rejects a body with no email ("Email is required to
    // create a customer", confirmed against a real request) — it does
    // NOT auto-resolve it from the auth identity like the comment here
    // previously assumed. A failure below just means this identity is
    // already linked to a customer, which is the normal case for a
    // returning user.
    const claims = decodeJwtPayload(token)
    const userMetadata = claims?.user_metadata as
      | { email?: string; given_name?: string; family_name?: string }
      | undefined

    if (userMetadata?.email) {
      await sdk.store.customer
        .create(
          {
            email: userMetadata.email,
            first_name: userMetadata.given_name,
            last_name: userMetadata.family_name,
          },
          {},
          { authorization: `Bearer ${token}` }
        )
        .catch(() => null)
    }

    // Whichever path just ran above, `token` is still the ORIGINAL
    // actor-less one — it has no actor_id, so retrieveCustomer() rejects
    // it even though the identity is now correctly linked to a customer.
    // sdk.auth.refresh() is exactly what Medusa's own SDK docs describe
    // calling at this point in the OAuth flow: exchange it for a token
    // that reflects the linked actor.
    const refreshed = await sdk.auth.refresh({
      authorization: `Bearer ${token}`,
    })
    if (
      typeof refreshed !== "object" ||
      refreshed === null ||
      !("token" in refreshed) ||
      "mfa_required" in refreshed ||
      "verification_required" in refreshed
    ) {
      throw new Error("Unexpected multi-step response refreshing the Google auth token")
    }
    token = refreshed.token

    await setAuthToken(token)

    await transferCart({ authorization: `Bearer ${token}` }).catch(() => null)
  } catch (error) {
    return NextResponse.redirect(
      new URL(`/${defaultRegion}/account?error=google-sign-in-failed`, baseUrl)
    )
  }

  return NextResponse.redirect(new URL(`/${defaultRegion}/account`, baseUrl))
}
