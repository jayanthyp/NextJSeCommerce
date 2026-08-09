import { listProductsWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { listProductReviewSummaries } from "@lib/data/reviews"
import ProductPreview from "@modules/products/components/product-preview"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import InfiniteProductGrid from "./infinite-product-grid"

export const PRODUCT_LIMIT = 12

export type PaginatedProductsParams = {
  limit: number
  collection_id?: string[]
  category_id?: string[]
  id?: string[]
  order?: string
}

// Shared by this (page 1, server-rendered) and load-more-products.tsx
// (pages 2+, fetched client-side by InfiniteProductGrid) so both build an
// identical query — one place to change if these filters ever do.
export const buildProductQueryParams = ({
  sortBy,
  collectionId,
  categoryId,
  productsIds,
}: {
  sortBy?: SortOptions
  collectionId?: string
  categoryId?: string
  productsIds?: string[]
}): PaginatedProductsParams => {
  const queryParams: PaginatedProductsParams = {
    limit: PRODUCT_LIMIT,
  }

  if (collectionId) {
    queryParams["collection_id"] = [collectionId]
  }

  if (categoryId) {
    queryParams["category_id"] = [categoryId]
  }

  if (productsIds) {
    queryParams["id"] = productsIds
  }

  if (sortBy === "created_at") {
    queryParams["order"] = "created_at"
  }

  return queryParams
}

// Page 1 is server-rendered here exactly as before (initial-load
// performance/SEO unaffected — the full first 12 products are still in the
// initial HTML). InfiniteProductGrid (client) takes it from there, fetching
// subsequent pages via the loadMoreProducts server action as the shopper
// scrolls, instead of numbered Pagination.
export default async function PaginatedProducts({
  sortBy,
  page,
  collectionId,
  categoryId,
  productsIds,
  countryCode,
}: {
  sortBy?: SortOptions
  page: number
  collectionId?: string
  categoryId?: string
  productsIds?: string[]
  countryCode: string
}) {
  const queryParams = buildProductQueryParams({
    sortBy,
    collectionId,
    categoryId,
    productsIds,
  })

  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  let {
    response: { products, count },
  } = await listProductsWithSort({
    page,
    queryParams,
    sortBy,
    countryCode,
  })

  const totalPages = Math.ceil(count / PRODUCT_LIMIT)

  // One batch call for the whole page rather than each card fetching its
  // own reviews — see listProductReviewSummaries.
  const reviewSummaries = await listProductReviewSummaries(
    products.map((p) => p.id).filter(Boolean) as string[]
  )

  const initialItems = products.map((p) => (
    <li key={p.id}>
      <ProductPreview
        product={p}
        region={region}
        reviewSummary={p.id ? reviewSummaries[p.id] : undefined}
      />
    </li>
  ))

  return (
    <InfiniteProductGrid
      initialItems={initialItems}
      initialPage={page}
      initialTotalPages={totalPages}
      sortBy={sortBy}
      collectionId={collectionId}
      categoryId={categoryId}
      productsIds={productsIds}
      countryCode={countryCode}
    />
  )
}
