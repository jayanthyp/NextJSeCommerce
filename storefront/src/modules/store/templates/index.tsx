import { Suspense } from "react"

import { listCategories } from "@lib/data/categories"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { getPriceBounds } from "@lib/util/filter-products-by-price"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import {
  DesktopSidebar,
  MobileFilters,
} from "@modules/store/components/refinement-list/filter-sidebar"
import SortProducts, {
  SortOptions,
} from "@modules/store/components/refinement-list/sort-products"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = async ({
  sortBy,
  page,
  countryCode,
  categoryIds,
  minPrice,
  maxPrice,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
  categoryIds?: string[]
  minPrice?: number
  maxPrice?: number
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  // Sidebar config (categories + price slider bounds) is fetched here,
  // outside the Suspense boundary around the product grid -- it's
  // static/config-derived per product page, doesn't need its own skeleton
  // (see issue #28 spec), and Next.js's fetch cache dedupes this against
  // the equivalent request PaginatedProducts makes for the actual listing.
  const [categories, region] = await Promise.all([
    listCategories().catch(() => []),
    getRegion(countryCode),
  ])

  let priceBounds = null

  if (region) {
    const { response } = await listProducts({
      pageParam: 0,
      queryParams: { limit: 100 },
      countryCode,
    })
    priceBounds = getPriceBounds(response.products)
  }

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }))
  const currencyCode = region?.currency_code

  return (
    <div
      className="flex flex-col small:items-start py-6 content-container"
      data-testid="category-container"
    >
      <div className="flex gap-x-8 items-start w-full">
        <DesktopSidebar
          categories={categoryOptions}
          bounds={priceBounds}
          currencyCode={currencyCode}
        />
        <div className="w-full">
          <div className="flex items-center justify-between mb-8 gap-x-4">
            <h1 className="text-2xl-semi" data-testid="store-page-title">
              All products
            </h1>
            <div className="flex items-center gap-x-3">
              <MobileFilters
                categories={categoryOptions}
                bounds={priceBounds}
                currencyCode={currencyCode}
              />
              <SortProducts sortBy={sort} data-testid="sort-by-trigger" />
            </div>
          </div>
          <Suspense fallback={<SkeletonProductGrid />}>
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              countryCode={countryCode}
              categoryIds={categoryIds}
              minPrice={minPrice}
              maxPrice={maxPrice}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

export default StoreTemplate
