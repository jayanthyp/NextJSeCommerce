"use client"

import { useEffect } from "react"
import { HttpTypes } from "@medusajs/types"

import { trackBeginCheckout } from "@lib/util/analytics"

export default function TrackBeginCheckout({
  cart,
}: {
  cart: HttpTypes.StoreCart
}) {
  useEffect(() => {
    const items = (cart.items ?? []).map((item) => ({
      item_id: item.variant_id ?? item.id,
      item_name: item.product_title ?? item.title,
      price: item.unit_price ?? item.total / (item.quantity || 1),
      quantity: item.quantity,
    }))

    trackBeginCheckout(items, cart.currency_code, cart.total ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.id])

  return null
}
