"use client"

import { Dialog, Transition } from "@headlessui/react"
import { Fragment } from "react"

import useToggleState from "@lib/hooks/use-toggle-state"
import X from "@modules/common/icons/x"

import CategoryFilter, { CategoryOption } from "./category-filter"
import PriceRangeFilter from "./price-range-filter"
import { PriceBounds, useProductFilters } from "./use-product-filters"

type MobileFiltersProps = {
  categories: CategoryOption[]
  bounds: PriceBounds | null
  currencyCode?: string
}

// Below `small` (and 768-1023px, per the breakpoint rules in issue #28) the
// sidebar collapses into a "Filters" trigger + bottom-sheet drawer instead
// of a persistent column -- reuses the same slide-in keyframe and
// no-scrollbar utility already defined in tailwind.config.js/globals.css,
// and the headlessui Dialog/Transition pattern already used for the mobile
// product-options sheet (see product-actions/mobile-actions.tsx).
const MobileFilters = ({
  categories,
  bounds,
  currencyCode,
}: MobileFiltersProps) => {
  const { state, open, close } = useToggleState()
  const {
    selectedCategoryIds,
    setCategoryIds,
    priceValue,
    setPriceRange,
    clearAll,
    activeFilterCount,
  } = useProductFilters(bounds)

  return (
    <div className="small:hidden">
      <button
        type="button"
        onClick={open}
        className="relative flex items-center gap-x-1.5 min-h-[44px] txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base border border-ui-border-base rounded-rounded px-3"
        data-testid="mobile-filters-trigger"
      >
        Filters
        {activeFilterCount > 0 && (
          <span
            className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-ui-fg-base text-white text-[10px] leading-none"
            data-testid="mobile-filters-badge"
          >
            {activeFilterCount}
          </span>
        )}
      </button>

      <Transition appear show={state} as={Fragment}>
        <Dialog as="div" className="relative z-[75]" onClose={close}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-700 bg-opacity-75 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed bottom-0 inset-x-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="translate-y-full"
              enterTo="translate-y-0"
              leave="ease-in duration-200"
              leaveFrom="translate-y-0"
              leaveTo="translate-y-full"
            >
              <Dialog.Panel
                className="w-full bg-white dark:bg-ui-bg-base rounded-t-large flex flex-col max-h-[80vh]"
                data-testid="mobile-filters-drawer"
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-ui-border-base">
                  <Dialog.Title className="text-base-semi text-ui-fg-base">
                    Filters
                  </Dialog.Title>
                  <button
                    onClick={close}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center"
                    data-testid="mobile-filters-close"
                    aria-label="Close filters"
                  >
                    <X />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4 flex flex-col gap-y-8">
                  {categories.length > 0 && (
                    <div className="flex flex-col gap-y-3">
                      <h3 className="text-base-semi text-ui-fg-base">
                        Category
                      </h3>
                      <CategoryFilter
                        categories={categories}
                        selectedIds={selectedCategoryIds}
                        onChange={setCategoryIds}
                      />
                    </div>
                  )}

                  {bounds && (
                    <div className="flex flex-col gap-y-3">
                      <h3 className="text-base-semi text-ui-fg-base">
                        Price
                      </h3>
                      <PriceRangeFilter
                        bounds={bounds}
                        value={priceValue}
                        currencyCode={currencyCode}
                        onChange={setPriceRange}
                      />
                    </div>
                  )}
                </div>

                <div className="sticky bottom-0 flex items-center gap-x-3 px-6 py-4 border-t border-ui-border-base bg-white dark:bg-ui-bg-base">
                  <button
                    type="button"
                    onClick={() => {
                      clearAll()
                      close()
                    }}
                    className="contrast-btn min-h-[44px] flex-1"
                    data-testid="mobile-filters-clear"
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="min-h-[44px] flex-1 rounded-full bg-ui-fg-base text-white hover:opacity-90 transition-opacity"
                    data-testid="mobile-filters-apply"
                  >
                    Apply
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </div>
  )
}

export default MobileFilters
