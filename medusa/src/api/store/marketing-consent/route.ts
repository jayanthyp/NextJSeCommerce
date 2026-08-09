import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { MARKETING_CONSENT_MODULE } from "../../../modules/marketing-consent"
import MarketingConsentModuleService from "../../../modules/marketing-consent/service"

type CaptureConsentBody = {
  email: string
  order_id?: string
  source?: string
}

// Loose on purpose (matches the storefront's own input type="email"
// validation) — this only needs to reject obviously-malformed input, not
// fully validate RFC 5322.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Public, no auth — captured inline during checkout (see
// checkout/components/shipping-address) and from the footer newsletter
// signup form (see storefront/src/modules/layout/components/newsletter-signup),
// before the customer necessarily has a session (guest checkout).
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as CaptureConsentBody
  if (!body.email || !EMAIL_PATTERN.test(body.email)) {
    res.status(400).json({ message: "A valid email is required" })
    return
  }

  const service: MarketingConsentModuleService = req.scope.resolve(
    MARKETING_CONSENT_MODULE
  )

  const [existing] = await service.listMarketingConsents({ email: body.email })
  const consent = existing
    ? existing
    : await service.createMarketingConsents({
        email: body.email,
        opted_in_at: new Date(),
        source: body.source ?? "checkout",
        order_id: body.order_id ?? null,
      })

  // Sync to MailerLite happens out-of-band via the subscriber, not inline —
  // a MailerLite outage shouldn't be able to affect checkout or the footer
  // signup form. Only fires for a genuinely new record: re-emitting on an
  // already-subscribed resubmission would just be redundant work for the
  // subscriber (and subscriber.ts's own upsert is idempotent anyway, but no
  // reason to invoke it).
  if (!existing) {
    await req.scope
      .resolve(Modules.EVENT_BUS)
      .emit({ name: "marketing-consent.captured", data: { id: consent.id } })
  }

  res.json({
    marketing_consent: { email: consent.email },
    already_subscribed: !!existing,
  })
}
