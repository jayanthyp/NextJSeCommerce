import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { MARKETING_CONSENT_MODULE } from "../modules/marketing-consent"
import type MarketingConsentModuleService from "../modules/marketing-consent/service"

/**
 * Syncs a captured consent to MailerLite as a subscriber group. Runs
 * out-of-band from the checkout request that captured it — a MailerLite
 * outage or rate limit shouldn't be able to affect checkout, mirroring the
 * order-placed subscriber's separation from the order-creation request.
 *
 * No-ops without MAILERLITE_API_KEY configured (same optional-integration
 * pattern as SMTP/MeiliSearch/Google auth elsewhere in this project) — the
 * consent record still persists locally either way, just unsynced.
 */
export default async function marketingConsentCapturedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const apiKey = process.env.MAILERLITE_API_KEY

  if (!apiKey) {
    return
  }

  const consentService: MarketingConsentModuleService = container.resolve(
    MARKETING_CONSENT_MODULE
  )
  const consent = await consentService
    .retrieveMarketingConsent(data.id)
    .catch(() => null)

  if (!consent) {
    return
  }

  try {
    const response = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        email: consent.email,
        groups: process.env.MAILERLITE_GROUP_ID
          ? [process.env.MAILERLITE_GROUP_ID]
          : undefined,
      }),
    })

    if (!response.ok) {
      throw new Error(`MailerLite responded ${response.status}`)
    }

    await consentService.updateMarketingConsents({
      id: consent.id,
      mailerlite_synced_at: new Date(),
    })

    logger.info(`[marketing-consent] synced ${consent.email} to MailerLite`)
  } catch (error) {
    logger.error(
      `[marketing-consent] failed to sync ${consent.email} to MailerLite: ${
        (error as Error).message
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "marketing-consent.captured",
}
