import { beforeEach, describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useLocalWishlist } from "./use-wishlist"

describe("useLocalWishlist", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("is not wishlisted before any toggle", () => {
    const { result } = renderHook(() => useLocalWishlist("prod_1"))
    expect(result.current.isWishlisted).toBe(false)
  })

  it("toggling adds the product, toggling again removes it", () => {
    const { result } = renderHook(() => useLocalWishlist("prod_1"))

    act(() => result.current.toggle())
    expect(result.current.isWishlisted).toBe(true)

    act(() => result.current.toggle())
    expect(result.current.isWishlisted).toBe(false)
  })

  it("persists across hook instances via localStorage", () => {
    const first = renderHook(() => useLocalWishlist("prod_1"))
    act(() => first.result.current.toggle())

    const second = renderHook(() => useLocalWishlist("prod_1"))
    expect(second.result.current.isWishlisted).toBe(true)
  })

  it("tracks products independently by id", () => {
    const a = renderHook(() => useLocalWishlist("prod_1"))
    const b = renderHook(() => useLocalWishlist("prod_2"))

    act(() => a.result.current.toggle())

    expect(a.result.current.isWishlisted).toBe(true)
    expect(b.result.current.isWishlisted).toBe(false)
  })
})
