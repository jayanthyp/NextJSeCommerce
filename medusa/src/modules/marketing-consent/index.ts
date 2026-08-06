import MarketingConsentModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const MARKETING_CONSENT_MODULE = "marketing_consent"

export default Module(MARKETING_CONSENT_MODULE, {
  service: MarketingConsentModuleService,
})
