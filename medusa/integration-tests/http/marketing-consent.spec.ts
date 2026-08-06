import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MARKETING_CONSENT_MODULE } from "../../src/modules/marketing-consent"
import MarketingConsentModuleService from "../../src/modules/marketing-consent/service"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("Store marketing consent", () => {
      it("rejects a request with no email", async () => {
        await expect(
          api.post("/store/marketing-consent", {})
        ).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("captures consent without requiring auth (guest checkout)", async () => {
        const email = `consent-${Date.now()}@example.com`

        const { status } = await api.post("/store/marketing-consent", { email })
        expect(status).toEqual(200)

        const consentService: MarketingConsentModuleService =
          getContainer().resolve(MARKETING_CONSENT_MODULE)
        const [consent] = await consentService.listMarketingConsents({ email })
        expect(consent).toBeTruthy()
        expect(consent.source).toEqual("checkout")
      })

      it("does not create a duplicate record for the same email", async () => {
        const email = `consent-dupe-${Date.now()}@example.com`

        await api.post("/store/marketing-consent", { email })
        await api.post("/store/marketing-consent", { email })

        const consentService: MarketingConsentModuleService =
          getContainer().resolve(MARKETING_CONSENT_MODULE)
        const records = await consentService.listMarketingConsents({ email })
        expect(records).toHaveLength(1)
      })
    })
  },
})
