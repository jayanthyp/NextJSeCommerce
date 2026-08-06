import { Suspense } from "react"

import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import SortProducts, {
  SortOptions,
} from "@modules/store/components/refinement-list/sort-products"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <div
      className="flex flex-col small:items-start py-6 content-container"
      data-testid="category-container"
    >
      <div className="w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl-semi" data-testid="store-page-title">
            All products
          </h1>
          <SortProducts sortBy={sort} data-testid="sort-by-trigger" />
        </div>
        <Suspense fallback={<SkeletonProductGrid />}>
          <PaginatedProducts
            sortBy={sort}
            page={pageNumber}
            countryCode={countryCode}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default StoreTemplate
