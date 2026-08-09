"use client"

import CategoryFilter, { CategoryOption } from "./category-filter"
import PriceRangeFilter from "./price-range-filter"
import { PriceBounds, useProductFilters } from "./use-product-filters"

type DesktopSidebarProps = {
  categories: CategoryOption[]
  bounds: PriceBounds | null
  currencyCode?: string
}

// Persistent left sidebar for >= `small` (1024px) -- below that, the same
// filters render inside the mobile drawer (see mobile-filters.tsx) since a
// fixed 240px column doesn't leave a usable grid width on smaller screens.
const DesktopSidebar = ({
  categories,
  bounds,
  currencyCode,
}: DesktopSidebarProps) => {
  const { selectedCategoryIds, setCategoryIds, priceValue, setPriceRange } =
    useProductFilters(bounds)

  return (
    <aside
      className="hidden small:flex flex-col gap-y-8 w-[240px] shrink-0 border border-ui-border-base rounded-rounded p-4"
      data-testid="filter-sidebar-desktop"
    >
      {categories.length > 0 && (
        <div className="flex flex-col gap-y-3">
          <h3 className="text-base-semi text-ui-fg-base">Category</h3>
          <CategoryFilter
            categories={categories}
            selectedIds={selectedCategoryIds}
            onChange={setCategoryIds}
          />
        </div>
      )}

      {bounds && (
        <div className="flex flex-col gap-y-3">
          <h3 className="text-base-semi text-ui-fg-base">Price</h3>
          <PriceRangeFilter
            bounds={bounds}
            value={priceValue}
            currencyCode={currencyCode}
            onChange={setPriceRange}
          />
        </div>
      )}
    </aside>
  )
}

export default DesktopSidebar
