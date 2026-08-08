import { NextRequest, NextResponse } from "next/server"

import { sdk } from "@lib/config"
import { setAuthToken, getAuthHeaders } from "@lib/data/cookies"
import { transferCart } from "@lib/data/customer"
import { getBaseURL } from "@lib/util/env"

// Deliberately outside [countryCode] — see loginWithOAuth's comment for why.
// Lands on the default region's account page rather than trying to restore
// the exact page the user started from; smuggling the original countryCode
// through Google's OAuth `state` round trip isn't worth the complexity for
// what's already a fairly rare navigation (landing on /account after
// signing in is standard behavior for "Continue with Google" flows).
export async function GET(request: NextRequest) {
  const defaultRegion = process.env.NEXT_PUBLIC_DEFAULT_REGION || "us"
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

    await setAuthToken(result)

    // First-time Google sign-in returns an actor-less token (no linked
    // Customer yet) — same two-step shape as the emailpass register flow.
    // No email/name to pass here (Google's redirect only carries `code`
    // and `state`, not profile data) — the backend resolves those from the
    // auth identity's own stored provider data via req.auth_context, the
    // same way /store/customers always has for every other provider.
    // A failure here just means this identity is already linked to a
    // customer, which is the normal case for a returning user.
    const headers = await getAuthHeaders()
    await sdk.store.customer.create({}, {}, headers).catch(() => null)

    // Whichever path just ran above, the token set at the top of this
    // handler is still the ORIGINAL actor-less one — it has no actor_id,
    // so retrieveCustomer() rejects it even though the identity is now
    // correctly linked to a customer. sdk.auth.refresh() is exactly what
    // Medusa's own SDK docs describe calling at this point in the OAuth
    // flow: exchange it for a token that reflects the linked actor.
    const refreshed = await sdk.auth.refresh(await getAuthHeaders())
    if (
      typeof refreshed === "object" &&
      refreshed !== null &&
      "token" in refreshed &&
      !("mfa_required" in refreshed) &&
      !("verification_required" in refreshed)
    ) {
      await setAuthToken(refreshed.token)
    } else {
      throw new Error("Unexpected multi-step response refreshing the Google auth token")
    }

    await transferCart().catch(() => null)
  } catch (error) {
    return NextResponse.redirect(
      new URL(`/${defaultRegion}/account?error=google-sign-in-failed`, baseUrl)
    )
  }

  return NextResponse.redirect(new URL(`/${defaultRegion}/account`, baseUrl))
}
