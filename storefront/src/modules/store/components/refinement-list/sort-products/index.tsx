"use client"

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

import ChevronDown from "@modules/common/icons/chevron-down"

export type SortOptions = "price_asc" | "price_desc" | "created_at"

type SortProductsProps = {
  sortBy: SortOptions
  "data-testid"?: string
}

const sortOptions: { value: SortOptions; label: string }[] = [
  { value: "created_at", label: "Latest Arrivals" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
]

// A single compact dropdown reads better next to the results header than a
// full-height radio list taking up its own sidebar column — this used to be
// the entire contents of a dedicated left column (see refinement-list),
// which was a lot of vertical space for one control.
const SortProducts = ({
  sortBy,
  "data-testid": dataTestId,
}: SortProductsProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const current = sortOptions.find((o) => o.value === sortBy) ?? sortOptions[0]

  const handleChange = useCallback(
    (value: SortOptions) => {
      const params = new URLSearchParams(searchParams)
      params.set("sortBy", value)
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams]
  )

  return (
    <>
      {/* Native <select> below `small` -- the OS's own picker UI is
          guaranteed accessible and can't overflow or feel cramped the way
          a custom-positioned dropdown panel might on a narrow screen,
          without having to hand-roll viewport-aware positioning. */}
      <div className="small:hidden">
        <label htmlFor="sort-by-select" className="sr-only">
          Sort by
        </label>
        <select
          id="sort-by-select"
          data-testid="sort-by-select-mobile"
          className="txt-compact-small text-ui-fg-base border border-ui-border-base rounded-rounded px-3 py-1.5 bg-white dark:bg-ui-bg-base"
          value={sortBy}
          onChange={(e) => handleChange(e.target.value as SortOptions)}
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="hidden small:block">
        <Listbox as="div" className="relative" value={sortBy} onChange={handleChange}>
          <ListboxButton
            className="flex items-center gap-x-1.5 txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base border border-ui-border-base rounded-rounded px-3 py-1.5"
            data-testid={dataTestId}
          >
            <span className="text-ui-fg-muted">Sort by:</span>
            <span className="text-ui-fg-base">{current.label}</span>
            <ChevronDown className="text-ui-fg-muted" />
          </ListboxButton>
          <ListboxOptions
            transition
            anchor="bottom end"
            className="z-[900] bg-white dark:bg-ui-bg-base drop-shadow-md text-small-regular text-black dark:text-ui-fg-base no-scrollbar rounded-rounded min-w-[220px] mt-2 transition duration-150 ease-in data-[closed]:opacity-0 data-[closed]:-translate-y-1"
            data-testid="sort-by-options"
          >
            {sortOptions.map((o) => (
              <ListboxOption
                key={o.value}
                value={o.value}
                className="py-2 hover:bg-gray-100 dark:hover:bg-ui-bg-subtle px-3 cursor-pointer flex items-center justify-between"
                data-testid="sort-by-option"
              >
                {o.label}
                {o.value === sortBy && <span aria-hidden>✓</span>}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </Listbox>
      </div>
    </>
  )
}

export default SortProducts
