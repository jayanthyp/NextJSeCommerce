"use client"

import { useEffect } from "react"
import { HttpTypes } from "@medusajs/types"

import { getProductPrice } from "@lib/util/get-product-price"
import { trackViewItem } from "@lib/util/analytics"

// Server-rendered product pages can't call gtag directly — this mounts once
// on the client to fire the view_item event after render.
export default function TrackViewItem({
  product,
}: {
  product: HttpTypes.StoreProduct
}) {
  useEffect(() => {
    const { cheapestPrice } = getProductPrice({ product })
    if (!cheapestPrice) return

    trackViewItem(
      {
        item_id: product.id,
        item_name: product.title,
        price: cheapestPrice.calculated_price_number,
      },
      cheapestPrice.currency_code
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id])

  return null
}
