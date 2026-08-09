import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"

const push = vi.fn()
let currentSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/us/store",
  useSearchParams: () => currentSearchParams,
}))

import { useProductFilters } from "./use-product-filters"

const bounds = { min: 0, max: 100 }

describe("useProductFilters", () => {
  beforeEach(() => {
    push.mockClear()
    currentSearchParams = new URLSearchParams()
  })

  it("reads no active filters from an empty URL", () => {
    const { result } = renderHook(() => useProductFilters(bounds))

    expect(result.current.selectedCategoryIds).toEqual([])
    expect(result.current.priceValue).toEqual([0, 100])
    expect(result.current.activeFilterCount).toBe(0)
  })

  it("parses category_id and price params from the URL", () => {
    currentSearchParams = new URLSearchParams(
      "category_id=cat_1,cat_2&minPrice=10&maxPrice=90"
    )
    const { result } = renderHook(() => useProductFilters(bounds))

    expect(result.current.selectedCategoryIds).toEqual(["cat_1", "cat_2"])
    expect(result.current.priceValue).toEqual([10, 90])
    expect(result.current.activeFilterCount).toBe(3)
  })

  it("setCategoryIds pushes the joined ids and resets page", () => {
    currentSearchParams = new URLSearchParams("sortBy=created_at&page=2")
    const { result } = renderHook(() => useProductFilters(bounds))

    result.current.setCategoryIds(["cat_1", "cat_2"])

    expect(push).toHaveBeenCalledWith(
      "/us/store?sortBy=created_at&category_id=cat_1%2Ccat_2"
    )
  })

  it("setCategoryIds with an empty array removes the param", () => {
    currentSearchParams = new URLSearchParams("category_id=cat_1")
    const { result } = renderHook(() => useProductFilters(bounds))

    result.current.setCategoryIds([])

    expect(push).toHaveBeenCalledWith("/us/store?")
  })

  it("setPriceRange omits params that match the bounds", () => {
    currentSearchParams = new URLSearchParams()
    const { result } = renderHook(() => useProductFilters(bounds))

    result.current.setPriceRange([0, 100])

    expect(push).toHaveBeenCalledWith("/us/store?")
  })

  it("setPriceRange sets params that differ from the bounds", () => {
    currentSearchParams = new URLSearchParams()
    const { result } = renderHook(() => useProductFilters(bounds))

    result.current.setPriceRange([20, 80])

    expect(push).toHaveBeenCalledWith("/us/store?minPrice=20&maxPrice=80")
  })

  it("clearAll removes category and price params", () => {
    currentSearchParams = new URLSearchParams(
      "sortBy=price_asc&category_id=cat_1&minPrice=10&maxPrice=90"
    )
    const { result } = renderHook(() => useProductFilters(bounds))

    result.current.clearAll()

    expect(push).toHaveBeenCalledWith("/us/store?sortBy=price_asc")
  })
})
