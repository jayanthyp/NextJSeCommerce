import { beforeEach, describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { recordProductView, useRecentlyViewed } from "./use-recently-viewed"

describe("use-recently-viewed", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("returns nothing before any product has been recorded", () => {
    const { result } = renderHook(() => useRecentlyViewed())
    expect(result.current).toEqual([])
  })

  it("returns recorded entries, most recent first", () => {
    recordProductView({ id: "1", handle: "t-shirt" })
    recordProductView({ id: "2", handle: "sweatshirt" })

    const { result } = renderHook(() => useRecentlyViewed())
    expect(result.current).toEqual([
      { id: "2", handle: "sweatshirt" },
      { id: "1", handle: "t-shirt" },
    ])
  })

  it("excludes the given product id (the one currently being viewed)", () => {
    recordProductView({ id: "1", handle: "t-shirt" })
    recordProductView({ id: "2", handle: "sweatshirt" })

    const { result } = renderHook(() => useRecentlyViewed("2"))
    expect(result.current).toEqual([{ id: "1", handle: "t-shirt" }])
  })

  it("re-recording an already-viewed product moves it to the front instead of duplicating it", () => {
    recordProductView({ id: "1", handle: "t-shirt" })
    recordProductView({ id: "2", handle: "sweatshirt" })
    recordProductView({ id: "1", handle: "t-shirt" })

    const { result } = renderHook(() => useRecentlyViewed())
    expect(result.current).toEqual([
      { id: "1", handle: "t-shirt" },
      { id: "2", handle: "sweatshirt" },
    ])
  })

  it("caps the stored history at 12 entries", () => {
    for (let i = 0; i < 15; i++) {
      recordProductView({ id: String(i), handle: `product-${i}` })
    }

    const { result } = renderHook(() => useRecentlyViewed())
    expect(result.current).toHaveLength(12)
    expect(result.current[0]).toEqual({ id: "14", handle: "product-14" })
  })
})
