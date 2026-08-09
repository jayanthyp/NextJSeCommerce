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

export type NewsletterSignupResult =
  | { success: true; alreadySubscribed: boolean }
  | { success: false; message: string }

// Footer newsletter signup — unlike captureMarketingConsent above, this
// form has its own success/error UI to drive, so it can't swallow errors
// the same way; the caller needs to know whether it worked.
export const subscribeToNewsletter = async (
  email: string
): Promise<NewsletterSignupResult> => {
  try {
    const response = (await sdk.client.fetch(`/store/marketing-consent`, {
      method: "POST",
      body: { email, source: "footer_newsletter" },
    })) as { already_subscribed: boolean }

    return { success: true, alreadySubscribed: response.already_subscribed }
  } catch {
    return {
      success: false,
      message: "Please enter a valid email address.",
    }
  }
}
