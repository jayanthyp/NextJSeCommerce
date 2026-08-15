"use client"

import { HttpTypes } from "@medusajs/types"

export type CategoryOption = Pick<HttpTypes.StoreProductCategory, "id" | "name">

type CategoryFilterProps = {
  categories: CategoryOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

// Vertical checkbox list, multi-select -- matches SortProducts's URL-param
// driven pattern (see sort-products/index.tsx), just with a set of values
// instead of one.
const CategoryFilter = ({
  categories,
  selectedIds,
  onChange,
}: CategoryFilterProps) => {
  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((selected) => selected !== id)
      : [...selectedIds, id]
    onChange(next)
  }

  if (categories.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-col gap-y-1" data-testid="category-filter">
      {categories.map((category) => {
        const active = selectedIds.includes(category.id)

        return (
          <li key={category.id}>
            <label
              className="flex items-center gap-x-3 min-h-[44px] cursor-pointer select-none"
              data-testid="category-filter-option"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded-base border-ui-border-base accent-ui-fg-base"
                checked={active}
                onChange={() => toggle(category.id)}
                data-testid={`category-checkbox-${category.id}`}
              />
              <span
                className={
                  active
                    ? "text-base-regular text-ui-fg-base font-semibold"
                    : "text-base-regular text-ui-fg-subtle hover:text-ui-fg-base"
                }
              >
                {category.name}
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

export default CategoryFilter
