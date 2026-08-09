import { describe, expect, it } from "vitest"

import {
  filterProductsByPriceRange,
  getPriceBounds,
  getProductMinPrice,
} from "./filter-products-by-price"

const product = (id: string, amounts: number[]): any => ({
  id,
  variants: amounts.map((amount, i) => ({
    id: `${id}-variant-${i}`,
    calculated_price: { calculated_amount: amount },
  })),
})

describe("getProductMinPrice", () => {
  it("returns the cheapest variant's calculated amount", () => {
    expect(getProductMinPrice(product("p1", [30, 10, 20]))).toBe(10)
  })

  it("returns null when there are no variants", () => {
    expect(getProductMinPrice({ id: "p1", variants: [] } as any)).toBeNull()
  })
})

describe("filterProductsByPriceRange", () => {
  const products = [
    product("cheap", [5]),
    product("mid", [50]),
    product("expensive", [500]),
  ]

  it("returns all products when no bounds are given", () => {
    expect(filterProductsByPriceRange(products)).toEqual(products)
  })

  it("filters out products below minPrice", () => {
    const result = filterProductsByPriceRange(products, 20)
    expect(result.map((p) => p.id)).toEqual(["mid", "expensive"])
  })

  it("filters out products above maxPrice", () => {
    const result = filterProductsByPriceRange(products, undefined, 100)
    expect(result.map((p) => p.id)).toEqual(["cheap", "mid"])
  })

  it("filters to a min/max window", () => {
    const result = filterProductsByPriceRange(products, 10, 100)
    expect(result.map((p) => p.id)).toEqual(["mid"])
  })
})

describe("getPriceBounds", () => {
  it("returns null for an empty product list", () => {
    expect(getPriceBounds([])).toBeNull()
  })

  it("derives min/max from the cheapest variant of each product", () => {
    const products = [product("a", [15]), product("b", [3]), product("c", [42])]
    expect(getPriceBounds(products)).toEqual({ min: 3, max: 42 })
  })
})
