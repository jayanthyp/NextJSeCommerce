import { HttpTypes } from "@medusajs/types"

/**
 * Medusa v2's store product list endpoint (`/store/products`, see
 * `@medusajs/types` `StoreProductParams`) has no `price`/`min_price`/
 * `max_price` query param -- price filtering isn't pushed down to the API.
 * As a documented fallback (see issue #28), we filter client-side on
 * whatever page of products was already fetched, using each product's
 * cheapest variant price the same way `sort-products.ts` does for
 * price_asc/price_desc sorting.
 */
export const getProductMinPrice = (
  product: HttpTypes.StoreProduct
): number | null => {
  if (!product.variants || product.variants.length === 0) {
    return null
  }

  const amounts = product.variants
    .map((variant: any) => variant?.calculated_price?.calculated_amount)
    .filter((amount: unknown): amount is number => typeof amount === "number")

  if (amounts.length === 0) {
    return null
  }

  return Math.min(...amounts)
}

export const filterProductsByPriceRange = (
  products: HttpTypes.StoreProduct[],
  minPrice?: number,
  maxPrice?: number
): HttpTypes.StoreProduct[] => {
  if (minPrice === undefined && maxPrice === undefined) {
    return products
  }

  return products.filter((product) => {
    const price = getProductMinPrice(product)

    if (price === null) {
      return false
    }

    if (minPrice !== undefined && price < minPrice) {
      return false
    }

    if (maxPrice !== undefined && price > maxPrice) {
      return false
    }

    return true
  })
}

/**
 * Derives slider bounds from whatever products were actually fetched for
 * the region, rather than a hardcoded range. There's no dedicated
 * "min/max price for region" endpoint, so this is an approximation over the
 * same up-to-100-product window the store page already fetches for
 * client-side sorting -- good enough for a range slider's bounds, not
 * meant to be an exact catalog-wide min/max.
 */
export const getPriceBounds = (
  products: HttpTypes.StoreProduct[]
): { min: number; max: number } | null => {
  const prices = products
    .map(getProductMinPrice)
    .filter((p): p is number => p !== null)

  if (prices.length === 0) {
    return null
  }

  return {
    min: Math.floor(Math.min(...prices)),
    max: Math.ceil(Math.max(...prices)),
  }
}
