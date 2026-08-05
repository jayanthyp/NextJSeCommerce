"use client"

import { useEffect } from "react"
import { HttpTypes } from "@medusajs/types"

import { trackPurchase } from "@lib/util/analytics"

// GA4 purchase events are easy to double-fire (refresh, back-navigation
// landing back on this page) — sessionStorage keyed on the order ID makes
// this idempotent per browser session.
export default function TrackPurchase({
  order,
}: {
  order: HttpTypes.StoreOrder
}) {
  useEffect(() => {
    const key = `ga4_purchase_tracked_${order.id}`
    if (window.sessionStorage.getItem(key)) {
      return
    }

    const items = (order.items ?? []).map((item) => ({
      item_id: item.variant_id ?? item.id,
      item_name: item.product_title ?? item.title,
      price: item.unit_price ?? item.total / (item.quantity || 1),
      quantity: item.quantity,
    }))

    trackPurchase(
      order.id,
      items,
      order.currency_code,
      order.total ?? 0,
      order.shipping_total ?? 0,
      order.tax_total ?? 0
    )

    window.sessionStorage.setItem(key, "1")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id])

  return null
}
