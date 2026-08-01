import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

/**
 * Sends the order confirmation email.
 *
 * Registering a notification provider is not enough on its own — nothing in
 * Medusa emits customer email by default. This subscriber is what actually
 * turns `order.placed` into a message through the configured provider (SMTP
 * when credentials are present, the local logging provider otherwise).
 */
export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const orderModuleService = container.resolve(Modules.ORDER)

  const order = await orderModuleService.retrieveOrder(data.id, {
    relations: ["items", "shipping_address"],
  })

  // Guest checkout without an email address is possible; nothing to send to.
  if (!order.email) {
    logger.warn(`[order-placed] order ${order.id} has no email — skipping`)
    return
  }

  await notificationModuleService.createNotifications({
    to: order.email,
    channel: "email",
    template: "order-placed",
    data: {
      order_id: order.id,
      display_id: order.display_id,
      currency_code: order.currency_code?.toUpperCase(),
      total: order.total,
      items: (order.items ?? []).map((item) => ({
        title: item.title,
        quantity: item.quantity,
      })),
    },
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
