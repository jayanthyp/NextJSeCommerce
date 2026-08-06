import { NextRequest, NextResponse } from "next/server"

import { sdk } from "@lib/config"
import { setAuthToken, getAuthHeaders } from "@lib/data/cookies"
import { transferCart } from "@lib/data/customer"

// Deliberately outside [countryCode] — see loginWithOAuth's comment for why.
// Lands on the default region's account page rather than trying to restore
// the exact page the user started from; smuggling the original countryCode
// through Google's OAuth `state` round trip isn't worth the complexity for
// what's already a fairly rare navigation (landing on /account after
// signing in is standard behavior for "Continue with Google" flows).
export async function GET(request: NextRequest) {
  const defaultRegion = process.env.NEXT_PUBLIC_DEFAULT_REGION || "us"
  const query = Object.fromEntries(request.nextUrl.searchParams.entries())

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

    await transferCart().catch(() => null)
  } catch (error) {
    return NextResponse.redirect(
      new URL(`/${defaultRegion}/account?error=google-sign-in-failed`, request.url)
    )
  }

  return NextResponse.redirect(new URL(`/${defaultRegion}/account`, request.url))
}
