"use server"

import { sdk } from "@lib/config"

// Public, no auth — captured during checkout, before the customer
// necessarily has a session (guest checkout). Failures here shouldn't ever
// block checkout, so this deliberately swallows errors.
export const captureMarketingConsent = async (email: string) => {
  return sdk.client
    .fetch(`/store/marketing-consent`, {
      method: "POST",
      body: { email },
    })
    .catch(() => null)
}
