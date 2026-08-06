import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import abandonedCartRemindersJob from "../../src/jobs/abandoned-cart-reminders"
import { ABANDONED_CART_TRACKING_MODULE } from "../../src/modules/abandoned-cart-tracking"
import AbandonedCartTrackingModuleService from "../../src/modules/abandoned-cart-tracking/service"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ getContainer, dbConnection }) => {
    describe("abandoned-cart-reminders job", () => {
      it("sends the 1h reminder for an idle cart with items and an email, and is idempotent on rerun", async () => {
        const container = getContainer()
        const cartModuleService = container.resolve(Modules.CART)
        const regionModuleService = container.resolve(Modules.REGION)

        const [region] = await regionModuleService.createRegions([
          { name: "Test Region", currency_code: "usd", countries: ["us"] },
        ])

        const cart = await cartModuleService.createCarts({
          currency_code: "usd",
          region_id: region.id,
          email: "abandoned@example.com",
          items: [
            {
              title: "Reviewed product",
              quantity: 1,
              unit_price: 1000,
              product_id: "prod_abandoned_test",
            },
          ],
        } as any)

        // Backdate past the 1h threshold — createCarts always stamps
        // updated_at to "now", so the only way to simulate an idle cart is
        // to push it back directly at the DB level after creation.
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
        await dbConnection.raw(`UPDATE cart SET updated_at = ? WHERE id = ?`, [
          twoHoursAgo.toISOString(),
          cart.id,
        ])

        await abandonedCartRemindersJob(container)

        const trackingService: AbandonedCartTrackingModuleService =
          container.resolve(ABANDONED_CART_TRACKING_MODULE)
        const [tracking] = await trackingService.listAbandonedCartTrackings({
          cart_id: cart.id,
        })

        expect(tracking).toBeTruthy()
        expect(tracking.reminder_1h_sent_at).toBeTruthy()
        expect(tracking.reminder_24h_sent_at).toBeFalsy()

        const firstSentAt = tracking.reminder_1h_sent_at

        // Running again immediately should not re-send the 1h tier.
        await abandonedCartRemindersJob(container)
        const [trackingAfterRerun] =
          await trackingService.listAbandonedCartTrackings({ cart_id: cart.id })
        expect(trackingAfterRerun.reminder_1h_sent_at).toEqual(firstSentAt)
      })

      it("skips carts with no email and carts that already completed", async () => {
        const container = getContainer()
        const cartModuleService = container.resolve(Modules.CART)
        const regionModuleService = container.resolve(Modules.REGION)

        const [region] = await regionModuleService.createRegions([
          { name: "Test Region 2", currency_code: "usd", countries: ["gb"] },
        ])

        const noEmailCart = await cartModuleService.createCarts({
          currency_code: "usd",
          region_id: region.id,
          items: [
            {
              title: "No email product",
              quantity: 1,
              unit_price: 500,
              product_id: "prod_no_email_test",
            },
          ],
        } as any)

        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
        await dbConnection.raw(`UPDATE cart SET updated_at = ? WHERE id = ?`, [
          twoHoursAgo.toISOString(),
          noEmailCart.id,
        ])

        await abandonedCartRemindersJob(container)

        const trackingService: AbandonedCartTrackingModuleService =
          container.resolve(ABANDONED_CART_TRACKING_MODULE)
        const tracking = await trackingService.listAbandonedCartTrackings({
          cart_id: noEmailCart.id,
        })
        expect(tracking).toHaveLength(0)
      })
    })
  },
})
