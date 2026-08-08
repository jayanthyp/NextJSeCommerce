import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { RAZORPAY_CONFIG_MODULE } from "../index"
import RazorpayConfigModuleService from "../service"
import RazorpayConfig from "../models/razorpay-config"

jest.setTimeout(60 * 1000)

process.env.RAZORPAY_CONFIG_ENCRYPTION_KEY ??= "test-encryption-key-not-for-production"

moduleIntegrationTestRunner<RazorpayConfigModuleService>({
  moduleName: RAZORPAY_CONFIG_MODULE,
  moduleModels: [RazorpayConfig],
  resolve: "./src/modules/razorpay-config",
  testSuite: ({ service }) => {
    describe("Razorpay Config Module Service", () => {
      it("has no active credentials before anything is configured", async () => {
        const credentials = await service.getActiveCredentials()
        expect(credentials).toBeNull()
      })

      it("defaults to test mode with nothing configured", async () => {
        const masked = await service.getMaskedConfig()
        expect(masked.active_mode).toBe("test")
        expect(masked.test.configured).toBe(false)
        expect(masked.live.configured).toBe(false)
      })

      it("stores test credentials and returns them decrypted as the active set", async () => {
        await service.updateConfig({
          test: {
            keyId: "rzp_test_key123",
            keySecret: "test_secret_abc",
            webhookSecret: "test_webhook_xyz",
          },
        })

        const credentials = await service.getActiveCredentials()
        expect(credentials).toEqual({
          keyId: "rzp_test_key123",
          keySecret: "test_secret_abc",
          webhookSecret: "test_webhook_xyz",
        })
      })

      it("never returns secrets in plaintext from the masked config", async () => {
        await service.updateConfig({
          test: {
            keyId: "rzp_test_key123",
            keySecret: "test_secret_abc",
            webhookSecret: "test_webhook_xyz",
          },
        })

        const masked = await service.getMaskedConfig()
        expect(masked.test.key_id).toBe("rzp_test_key123") // not secret, shown in full
        expect(masked.test.key_secret_masked).not.toContain("test_secret_abc")
        expect(masked.test.key_secret_masked).toMatch(/abc$/) // last 4 chars only
        expect(masked.test.webhook_secret_masked).not.toContain("test_webhook_xyz")
      })

      it("switching active_mode to live fails over to the live credentials", async () => {
        await service.updateConfig({
          test: { keyId: "test_key", keySecret: "test_secret", webhookSecret: "test_hook" },
          live: { keyId: "live_key", keySecret: "live_secret", webhookSecret: "live_hook" },
        })
        await service.updateConfig({ active_mode: "live" })

        const credentials = await service.getActiveCredentials()
        expect(credentials?.keyId).toBe("live_key")
      })

      it("switching to a mode with no credentials yet returns null rather than a stale set", async () => {
        await service.updateConfig({
          test: { keyId: "test_key", keySecret: "test_secret", webhookSecret: "test_hook" },
        })
        await service.updateConfig({ active_mode: "live" })

        const credentials = await service.getActiveCredentials()
        expect(credentials).toBeNull()
      })

      it("updating one mode's credentials does not disturb the other mode's", async () => {
        await service.updateConfig({
          test: { keyId: "test_key", keySecret: "test_secret", webhookSecret: "test_hook" },
          live: { keyId: "live_key", keySecret: "live_secret", webhookSecret: "live_hook" },
        })

        // Only touch the test key id -- live credentials should be untouched.
        await service.updateConfig({ test: { keyId: "test_key_updated" } })

        const masked = await service.getMaskedConfig()
        expect(masked.test.key_id).toBe("test_key_updated")
        expect(masked.live.key_id).toBe("live_key")
        expect(masked.live.configured).toBe(true)
      })

      it("flipping active_mode alone does not require resubmitting secrets", async () => {
        await service.updateConfig({
          test: { keyId: "test_key", keySecret: "test_secret", webhookSecret: "test_hook" },
          live: { keyId: "live_key", keySecret: "live_secret", webhookSecret: "live_hook" },
        })

        await service.updateConfig({ active_mode: "live" })
        await service.updateConfig({ active_mode: "test" })

        const credentials = await service.getActiveCredentials()
        expect(credentials?.keyId).toBe("test_key")
      })
    })
  },
})
