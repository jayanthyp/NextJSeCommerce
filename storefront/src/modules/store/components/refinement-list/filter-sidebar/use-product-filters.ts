"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useMemo } from "react"

export type PriceBounds = { min: number; max: number }

/**
 * URL-search-param driven filter state, following the same
 * useSearchParams/router.push pattern SortProducts already uses (see
 * refinement-list/sort-products/index.tsx) rather than separate client
 * state -- keeps filters shareable/bookmarkable and lets "Clear all" just
 * mean "reset these params".
 */
export const useProductFilters = (bounds: PriceBounds | null) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const selectedCategoryIds = useMemo(() => {
    const raw = searchParams.get("category_id")
    return raw ? raw.split(",").filter(Boolean) : []
  }, [searchParams])

  const minPrice = useMemo(() => {
    const raw = searchParams.get("minPrice")
    return raw !== null && !Number.isNaN(Number(raw)) ? Number(raw) : undefined
  }, [searchParams])

  const maxPrice = useMemo(() => {
    const raw = searchParams.get("maxPrice")
    return raw !== null && !Number.isNaN(Number(raw)) ? Number(raw) : undefined
  }, [searchParams])

  const priceValue: [number, number] = [
    minPrice ?? bounds?.min ?? 0,
    maxPrice ?? bounds?.max ?? 0,
  ]

  const pushParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams)
      mutate(params)
      // A filter change invalidates the current page of results.
      params.delete("page")
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams]
  )

  const setCategoryIds = useCallback(
    (ids: string[]) => {
      pushParams((params) => {
        if (ids.length === 0) {
          params.delete("category_id")
        } else {
          params.set("category_id", ids.join(","))
        }
      })
    },
    [pushParams]
  )

  const setPriceRange = useCallback(
    (value: [number, number]) => {
      pushParams((params) => {
        if (bounds && value[0] <= bounds.min) {
          params.delete("minPrice")
        } else {
          params.set("minPrice", String(Math.round(value[0])))
        }

        if (bounds && value[1] >= bounds.max) {
          params.delete("maxPrice")
        } else {
          params.set("maxPrice", String(Math.round(value[1])))
        }
      })
    },
    [pushParams, bounds]
  )

  const clearAll = useCallback(() => {
    pushParams((params) => {
      params.delete("category_id")
      params.delete("minPrice")
      params.delete("maxPrice")
    })
  }, [pushParams])

  const priceIsFiltered =
    (minPrice !== undefined && (!bounds || minPrice > bounds.min)) ||
    (maxPrice !== undefined && (!bounds || maxPrice < bounds.max))

  const activeFilterCount =
    selectedCategoryIds.length + (priceIsFiltered ? 1 : 0)

  return {
    selectedCategoryIds,
    setCategoryIds,
    priceValue,
    setPriceRange,
    clearAll,
    activeFilterCount,
  }
}
