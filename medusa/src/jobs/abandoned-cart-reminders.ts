import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  ABANDONED_CART_TRACKING_MODULE,
} from "../modules/abandoned-cart-tracking"
import type AbandonedCartTrackingModuleService from "../modules/abandoned-cart-tracking/service"

const HOUR = 60 * 60 * 1000
// Destructive automation (sending emails to customers) defaults to dry-run
// until a human has reviewed the dry-run output and flips this to false.
const DRY_RUN = process.env.ABANDONED_CART_REMINDERS_LIVE !== "true"
const TIERS = [
  { key: "reminder_1h_sent_at" as const, template: "abandoned-cart-1h", after: 1 * HOUR },
  { key: "reminder_24h_sent_at" as const, template: "abandoned-cart-24h", after: 24 * HOUR },
  { key: "reminder_3d_sent_at" as const, template: "abandoned-cart-3d", after: 3 * 24 * HOUR },
]

// Runs every 15 min. No `cart.abandoned` event exists in Medusa, so this has
// to poll — matches the same shape as back-in-stock-check.ts, the other job
// that has to poll for the same reason (no source event to subscribe to).
export default async function abandonedCartRemindersJob(
  container: MedusaContainer
) {
  const logger = container.resolve("logger")
  const cartModuleService = container.resolve(Modules.CART)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const trackingService: AbandonedCartTrackingModuleService = container.resolve(
    ABANDONED_CART_TRACKING_MODULE
  )

  const now = Date.now()
  const oldestTierCutoff = new Date(now - TIERS[0].after)

  // The broadest net (>= the shortest tier's threshold) catches candidates
  // for every tier in one query; which tier(s) actually apply is worked out
  // per-cart below from its real age.
  const candidates = await cartModuleService.listCarts(
    { updated_at: { $lte: oldestTierCutoff.toISOString() } },
    { relations: ["items"], take: 200 }
  )

  const idleCarts = candidates.filter(
    (cart) => !cart.completed_at && cart.email && (cart.items?.length ?? 0) > 0
  )

  if (!idleCarts.length) {
    return
  }

  const cartIds = idleCarts.map((c) => c.id)
  const trackingRows = await trackingService.listAbandonedCartTrackings({
    cart_id: cartIds,
  })
  const trackingByCartId = new Map(trackingRows.map((t) => [t.cart_id, t]))

  for (const cart of idleCarts) {
    const ageMs = now - new Date(cart.updated_at as string).getTime()
    let tracking = trackingByCartId.get(cart.id)

    if (!tracking) {
      tracking = await trackingService.createAbandonedCartTrackings({
        cart_id: cart.id,
      })
    }

    for (const tier of TIERS) {
      if (ageMs < tier.after) {
        continue
      }
      if (tracking[tier.key]) {
        continue // already sent this tier for this cart
      }

      try {
        if (DRY_RUN) {
          logger.info(
            `[abandoned-cart-reminders] DRY-RUN: would send ${tier.template} for cart ${cart.id}`
          )
          continue
        }

        await notificationModuleService.createNotifications({
          to: cart.email!,
          channel: "email",
          template: tier.template,
          data: {
            cart_id: cart.id,
            items: (cart.items ?? []).map((item) => ({
              title: item.product_title ?? item.title,
              quantity: item.quantity,
            })),
          },
        })

        await trackingService.updateAbandonedCartTrackings({
          id: tracking.id,
          [tier.key]: new Date(),
        })

        logger.info(
          `[abandoned-cart-reminders] sent ${tier.template} for cart ${cart.id}`
        )
      } catch (error) {
        logger.error(
          `[abandoned-cart-reminders] failed to send ${tier.template} for cart ${cart.id}: ${
            (error as Error).message
          }`
        )
      }
    }
  }
}

export const config = {
  name: "abandoned-cart-reminders",
  schedule: "*/15 * * * *",
}
