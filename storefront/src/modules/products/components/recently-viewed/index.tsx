"use client"

import { useEffect, useState } from "react"
import { HttpTypes } from "@medusajs/types"
import { Text } from "@medusajs/ui"

import { listProducts } from "@lib/data/products"
import { recordProductView, useRecentlyViewed } from "@lib/hooks/use-recently-viewed"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"
import { getProductPrice } from "@lib/util/get-product-price"
import { clx } from "@medusajs/ui"

const RecentlyViewedCard = ({ product }: { product: HttpTypes.StoreProduct }) => {
  const { cheapestPrice } = getProductPrice({ product })

  return (
    <LocalizedClientLink href={`/products/${product.handle}`} className="group">
      <Thumbnail thumbnail={product.thumbnail} images={product.images} size="full" />
      <div className="flex txt-compact-medium mt-4 justify-between">
        <Text className="text-ui-fg-subtle">{product.title}</Text>
        {cheapestPrice && (
          <Text
            className={clx("text-ui-fg-muted", {
              "text-ui-fg-interactive": cheapestPrice.price_type === "sale",
            })}
          >
            {cheapestPrice.calculated_price}
          </Text>
        )}
      </div>
    </LocalizedClientLink>
  )
}

// Records the current product as viewed, then shows a rail of *other*
// recently viewed products (localStorage-backed, see use-recently-viewed —
// deliberately not a backend module, this is inherently per-browser state).
export default function RecentlyViewed({
  product,
  countryCode,
}: {
  product?: HttpTypes.StoreProduct
  countryCode: string
}) {
  const entries = useRecentlyViewed(product?.id)
  const [products, setProducts] = useState<HttpTypes.StoreProduct[]>([])

  useEffect(() => {
    if (product) {
      recordProductView({ id: product.id, handle: product.handle! })
    }
  }, [product])

  useEffect(() => {
    if (!entries.length) {
      setProducts([])
      return
    }

    listProducts({
      countryCode,
      queryParams: { id: entries.map((e) => e.id), limit: entries.length },
    }).then(({ response }) => {
      // Preserve most-recently-viewed-first order — the API doesn't
      // guarantee it matches the id array order.
      const byId = new Map(response.products.map((p) => [p.id, p]))
      setProducts(entries.map((e) => byId.get(e.id)).filter(Boolean) as HttpTypes.StoreProduct[])
    })
  }, [entries, countryCode])

  if (!products.length) {
    return null
  }

  return (
    <div className="product-page-constraint py-16" data-testid="recently-viewed">
      <div className="flex flex-col items-center text-center mb-16">
        <span className="text-base-regular text-gray-600 mb-6">
          Recently viewed
        </span>
      </div>
      <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8">
        {products.slice(0, 4).map((p) => (
          <li key={p.id}>
            <RecentlyViewedCard product={p} />
          </li>
        ))}
      </ul>
    </div>
  )
}
