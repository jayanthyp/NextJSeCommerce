import { describe, expect, it } from "vitest"
import { formatCartCount } from "./format-cart-count"

describe("formatCartCount", () => {
  it("returns null when the cart is empty", () => {
    expect(formatCartCount(0)).toBeNull()
  })

  it("returns null for a negative count (defensive)", () => {
    expect(formatCartCount(-1)).toBeNull()
  })

  it("returns the plain number as a string for counts up to 99", () => {
    expect(formatCartCount(1)).toBe("1")
    expect(formatCartCount(42)).toBe("42")
    expect(formatCartCount(99)).toBe("99")
  })

  it("caps the display at 99+ beyond 99", () => {
    expect(formatCartCount(100)).toBe("99+")
    expect(formatCartCount(250)).toBe("99+")
  })
})
