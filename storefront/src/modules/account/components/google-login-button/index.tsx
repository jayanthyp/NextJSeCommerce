"use client"

import { Button } from "@medusajs/ui"
import { loginWithOAuth } from "@lib/data/customer"

// Hidden entirely when Google isn't configured (NEXT_PUBLIC_GOOGLE_AUTH_ENABLED
// unset) — same optional-integration visibility pattern as the search bar
// (see search-bar/index.tsx's searchEnabled check). Google credentials are a
// manual Google Cloud Console step, so this stays off by default.
const GoogleLoginButton = () => {
  if (process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED !== "true") {
    return null
  }

  return (
    <form action={loginWithOAuth.bind(null, "google")} className="w-full">
      <Button
        type="submit"
        variant="secondary"
        className="w-full mt-2"
        data-testid="google-login-button"
      >
        Continue with Google
      </Button>
    </form>
  )
}

export default GoogleLoginButton
