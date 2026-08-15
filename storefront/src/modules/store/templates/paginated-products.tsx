import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { filterProductsByPriceRange } from "@lib/util/filter-products-by-price"
import { sortProducts } from "@lib/util/sort-products"
import ProductPreview from "@modules/products/components/product-preview"
import { Pagination } from "@modules/store/components/pagination"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

const PRODUCT_LIMIT = 12

// Medusa v2's `/store/products` list endpoint has no price filter param
// (checked `@medusajs/types` `StoreProductParams`) -- category_id[] is
// standard/server-side, but price range is filtered client-side on the
// fetched window below (see filter-products-by-price.ts). 100 mirrors the
// window listProductsWithSort already fetches elsewhere in this app for
// client-side price sorting, so this isn't a new pattern.
const FETCH_LIMIT = 100

type PaginatedProductsParams = {
  limit: number
  collection_id?: string[]
  category_id?: string[]
  id?: string[]
  order?: string
}

export default async function PaginatedProducts({
  sortBy,
  page,
  collectionId,
  categoryId,
  categoryIds,
  productsIds,
  countryCode,
  minPrice,
  maxPrice,
}: {
  sortBy?: SortOptions
  page: number
  collectionId?: string
  categoryId?: string
  categoryIds?: string[]
  productsIds?: string[]
  countryCode: string
  minPrice?: number
  maxPrice?: number
}) {
  const queryParams: PaginatedProductsParams = {
    limit: FETCH_LIMIT,
  }

  if (collectionId) {
    queryParams["collection_id"] = [collectionId]
  }

  const resolvedCategoryIds =
    categoryIds && categoryIds.length > 0
      ? categoryIds
      : categoryId
      ? [categoryId]
      : undefined

  if (resolvedCategoryIds) {
    queryParams["category_id"] = resolvedCategoryIds
  }

  if (productsIds) {
    queryParams["id"] = productsIds
  }

  if (sortBy === "created_at") {
    queryParams["order"] = "created_at"
  }

  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  const {
    response: { products: fetchedProducts, count: fetchedCount },
  } = await listProducts({
    pageParam: 0,
    queryParams,
    countryCode,
  })

  const sortedProducts = sortProducts(fetchedProducts, sortBy ?? "created_at")

  const priceFilteredProducts = filterProductsByPriceRange(
    sortedProducts,
    minPrice,
    maxPrice
  )

  // Price filtering happens client-side on the fetched window above, so the
  // "true" count is only known for that window (capped at FETCH_LIMIT) --
  // an acceptable documented fallback per issue #28 given the store API has
  // no server-side price filter to push this down to.
  const isPriceFiltered = minPrice !== undefined || maxPrice !== undefined
  const count = isPriceFiltered ? priceFilteredProducts.length : fetchedCount

  const totalPages = Math.ceil(count / PRODUCT_LIMIT)
  const pageStart = (page - 1) * PRODUCT_LIMIT
  const products = priceFilteredProducts.slice(
    pageStart,
    pageStart + PRODUCT_LIMIT
  )

  return (
    <>
      <ul
        className="grid grid-cols-2 w-full small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8"
        data-testid="products-list"
      >
        {products.map((p) => {
          return (
            <li key={p.id}>
              <ProductPreview product={p} region={region} />
            </li>
          )
        })}
      </ul>
      {totalPages > 1 && (
        <Pagination
          data-testid="product-pagination"
          page={page}
          totalPages={totalPages}
        />
      )}
    </>
  )
}
