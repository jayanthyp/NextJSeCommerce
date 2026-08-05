import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { HttpTypes } from "@medusajs/types"
import { Text } from "@medusajs/ui"

import Product from "@modules/products/components/product-preview"
import AddAllButton from "./add-all-button"

type FrequentlyBoughtTogetherProps = {
  cart: HttpTypes.StoreCart
  countryCode: string
}

// v1 = same collection/tag-match heuristic as related-products, not a real
// co-purchase analysis — that needs order-volume history and a precomputed
// pairs table, a reasonable fast-follow once Phase 3's scheduled-job
// pattern exists to build it from. This also correctly covers the cold-start
// case (no order history yet) that a co-purchase table couldn't.
export default async function FrequentlyBoughtTogether({
  cart,
  countryCode,
}: FrequentlyBoughtTogetherProps) {
  const region = await getRegion(countryCode)
  if (!region || !cart.items?.length) {
    return null
  }

  const cartProductIds = new Set(
    cart.items.map((item) => item.product_id).filter(Boolean) as string[]
  )

  // Seed the suggestion query from the first cart item's collection/tags —
  // simplest reasonable signal without fetching full product data for
  // every line item.
  const seedItem = cart.items[0]
  const seedProduct = await listProducts({
    countryCode,
    queryParams: { id: [seedItem.product_id!] },
  }).then(({ response }) => response.products[0])

  if (!seedProduct) {
    return null
  }

  const queryParams: HttpTypes.StoreProductListParams = {
    region_id: region.id,
    is_giftcard: false,
  }
  if (seedProduct.collection_id) {
    queryParams.collection_id = [seedProduct.collection_id]
  }
  if (seedProduct.tags?.length) {
    queryParams.tag_id = seedProduct.tags.map((t) => t.id).filter(Boolean) as string[]
  }

  const suggestions = await listProducts({ countryCode, queryParams }).then(
    ({ response }) =>
      response.products.filter((p) => !cartProductIds.has(p.id)).slice(0, 4)
  )

  if (!suggestions.length) {
    return null
  }

  const variantIds = suggestions
    .map((p) => p.variants?.[0]?.id)
    .filter(Boolean) as string[]

  return (
    <div className="flex flex-col gap-y-4" data-testid="frequently-bought-together">
      <div className="flex items-center justify-between">
        <Text className="txt-large-plus text-ui-fg-base">
          Frequently bought together
        </Text>
        {variantIds.length > 0 && <AddAllButton variantIds={variantIds} />}
      </div>
      <div className="grid grid-cols-2 small:grid-cols-4 gap-x-4 gap-y-6">
        {suggestions.map((product) => (
          <Product key={product.id} region={region} product={product} />
        ))}
      </div>
    </div>
  )
}
