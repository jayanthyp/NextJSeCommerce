import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  BACK_IN_STOCK_REQUEST_MODULE,
} from "../modules/back-in-stock-request"
import type BackInStockRequestModuleService from "../modules/back-in-stock-request/service"

// Runs every 30 min. Medusa v2 emits no inventory-change events at all (see
// medusajs/medusa#11691), so — like abandoned-cart-reminders — this has to
// poll rather than react to an event.
export default async function backInStockCheckJob(container: MedusaContainer) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const customerModuleService = container.resolve(Modules.CUSTOMER)
  const requestService: BackInStockRequestModuleService = container.resolve(
    BACK_IN_STOCK_REQUEST_MODULE
  )

  const pending = await requestService.listBackInStockRequests({
    notified_at: null,
  })

  if (!pending.length) {
    return
  }

  const variantIds = [...new Set(pending.map((r) => r.variant_id))]

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "title",
      "manage_inventory",
      "allow_backorder",
      "inventory_items.inventory.location_levels.available_quantity",
    ],
    filters: { id: variantIds },
  })

  const availableVariantIds = new Set(
    (variants as any[])
      .filter((v) => {
        if (!v.manage_inventory || v.allow_backorder) {
          return true
        }
        const items = v.inventory_items ?? []
        const totalAvailable = items.reduce((sum: number, item: any) => {
          const levels = item.inventory?.location_levels ?? []
          return (
            sum +
            levels.reduce(
              (s: number, l: any) => s + (l.available_quantity ?? 0),
              0
            )
          )
        }, 0)
        return totalAvailable > 0
      })
      .map((v) => v.id)
  )

  if (!availableVariantIds.size) {
    return
  }

  for (const request of pending) {
    if (!availableVariantIds.has(request.variant_id)) {
      continue
    }

    const customer = await customerModuleService
      .retrieveCustomer(request.customer_id)
      .catch(() => null)

    if (!customer?.email) {
      continue
    }

    try {
      await notificationModuleService.createNotifications({
        to: customer.email,
        channel: "email",
        template: "back-in-stock",
        data: {
          product_id: request.product_id,
          variant_id: request.variant_id,
        },
      })

      await requestService.updateBackInStockRequests({
        id: request.id,
        notified_at: new Date(),
      })

      logger.info(
        `[back-in-stock-check] notified ${customer.email} for variant ${request.variant_id}`
      )
    } catch (error) {
      logger.error(
        `[back-in-stock-check] failed to notify for request ${request.id}: ${
          (error as Error).message
        }`
      )
    }
  }
}

export const config = {
  name: "back-in-stock-check",
  schedule: "*/30 * * * *",
}
