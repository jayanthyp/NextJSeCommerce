import { MedusaService } from "@medusajs/framework/utils"
import MarketingConsent from "./models/marketing-consent"

class MarketingConsentModuleService extends MedusaService({
  MarketingConsent,
}) {}

export default MarketingConsentModuleService
