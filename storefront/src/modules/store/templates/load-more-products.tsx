"use server"

import { listProductsWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { listProductReviewSummaries } from "@lib/data/reviews"
import ProductPreview from "@modules/products/components/product-preview"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { buildProductQueryParams, PRODUCT_LIMIT } from "./paginated-products"

// Called directly (not via a <form>) from InfiniteProductGrid as the
// shopper scrolls — returns already-rendered <li> Server Components
// (including ProductPreview, which is itself async) rather than raw JSON,
// so the client component doesn't need its own product-card rendering path.
export async function loadMoreProducts({
  page,
  sortBy,
  collectionId,
  categoryId,
  productsIds,
  countryCode,
}: {
  page: number
  sortBy?: SortOptions
  collectionId?: string
  categoryId?: string
  productsIds?: string[]
  countryCode: string
}): Promise<{ items: React.ReactNode[]; totalPages: number } | { error: string }> {
  try {
    const queryParams = buildProductQueryParams({
      sortBy,
      collectionId,
      categoryId,
      productsIds,
    })

    const region = await getRegion(countryCode)

    if (!region) {
      return { error: "Region not found." }
    }

    const {
      response: { products, count },
    } = await listProductsWithSort({ page, queryParams, sortBy, countryCode })

    const reviewSummaries = await listProductReviewSummaries(
      products.map((p) => p.id).filter(Boolean) as string[]
    )

    return {
      totalPages: Math.ceil(count / PRODUCT_LIMIT),
      items: products.map((p) => (
        <li key={p.id}>
          <ProductPreview
            product={p}
            region={region}
            reviewSummary={p.id ? reviewSummaries[p.id] : undefined}
          />
        </li>
      )),
    }
  } catch {
    return { error: "Couldn't load more products." }
  }
}
