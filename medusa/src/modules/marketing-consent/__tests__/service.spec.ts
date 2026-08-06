import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { MARKETING_CONSENT_MODULE } from "../index"
import MarketingConsentModuleService from "../service"
import MarketingConsent from "../models/marketing-consent"

jest.setTimeout(60 * 1000)

moduleIntegrationTestRunner<MarketingConsentModuleService>({
  moduleName: MARKETING_CONSENT_MODULE,
  moduleModels: [MarketingConsent],
  resolve: "./src/modules/marketing-consent",
  testSuite: ({ service }) => {
    describe("Marketing Consent Module Service", () => {
      it("creates a consent record unsynced by default", async () => {
        const [consent] = await service.createMarketingConsents([
          {
            email: "shopper@example.com",
            opted_in_at: new Date(),
            source: "checkout",
          },
        ])

        expect(consent.mailerlite_synced_at).toBeFalsy()
      })

      it("enforces one consent record per email", async () => {
        await service.createMarketingConsents([
          {
            email: "unique@example.com",
            opted_in_at: new Date(),
            source: "checkout",
          },
        ])

        await expect(
          service.createMarketingConsents([
            {
              email: "unique@example.com",
              opted_in_at: new Date(),
              source: "checkout",
            },
          ])
        ).rejects.toThrow()
      })

      it("marks a consent record as synced to MailerLite", async () => {
        const [consent] = await service.createMarketingConsents([
          {
            email: "sync-me@example.com",
            opted_in_at: new Date(),
            source: "checkout",
          },
        ])

        const updated = await service.updateMarketingConsents({
          id: consent.id,
          mailerlite_synced_at: new Date(),
        })

        expect(updated.mailerlite_synced_at).toBeTruthy()
      })
    })
  },
})
