import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { MARKETING_CONSENT_MODULE } from "../../../modules/marketing-consent"
import MarketingConsentModuleService from "../../../modules/marketing-consent/service"

type CaptureConsentBody = {
  email: string
  order_id?: string
}

// Public, no auth — captured inline during checkout (see
// checkout/components/shipping-address), before the customer necessarily
// has a session (guest checkout).
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as CaptureConsentBody
  if (!body.email) {
    res.status(400).json({ message: "email is required" })
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
        source: "checkout",
        order_id: body.order_id ?? null,
      })

  // Sync to MailerLite happens out-of-band via the subscriber, not inline —
  // a MailerLite outage shouldn't be able to affect checkout.
  await req.scope
    .resolve(Modules.EVENT_BUS)
    .emit({ name: "marketing-consent.captured", data: { id: consent.id } })

  res.json({ marketing_consent: { email: consent.email } })
}
