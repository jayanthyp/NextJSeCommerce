import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { ABANDONED_CART_TRACKING_MODULE } from "../index"
import AbandonedCartTrackingModuleService from "../service"
import AbandonedCartTracking from "../models/abandoned-cart-tracking"

jest.setTimeout(60 * 1000)

moduleIntegrationTestRunner<AbandonedCartTrackingModuleService>({
  moduleName: ABANDONED_CART_TRACKING_MODULE,
  moduleModels: [AbandonedCartTracking],
  resolve: "./src/modules/abandoned-cart-tracking",
  testSuite: ({ service }) => {
    describe("Abandoned Cart Tracking Module Service", () => {
      it("creates a tracking row with all reminder tiers unset", async () => {
        const [row] = await service.createAbandonedCartTrackings([
          { cart_id: "cart_1" },
        ])

        expect(row.cart_id).toEqual("cart_1")
        expect(row.reminder_1h_sent_at).toBeFalsy()
        expect(row.reminder_24h_sent_at).toBeFalsy()
        expect(row.reminder_3d_sent_at).toBeFalsy()
      })

      it("records a reminder tier as sent", async () => {
        const [row] = await service.createAbandonedCartTrackings([
          { cart_id: "cart_2" },
        ])

        const sentAt = new Date()
        const updated = await service.updateAbandonedCartTrackings({
          id: row.id,
          reminder_1h_sent_at: sentAt,
        })

        expect(updated.reminder_1h_sent_at).toBeTruthy()
        expect(updated.reminder_24h_sent_at).toBeFalsy()
      })

      it("looks up tracking rows by cart_id", async () => {
        await service.createAbandonedCartTrackings([{ cart_id: "cart_3" }])

        const rows = await service.listAbandonedCartTrackings({
          cart_id: ["cart_3"],
        })
        expect(rows).toHaveLength(1)
      })
    })
  },
})
