import { describe, expect, it } from "vitest"
import { getPercentageDiff } from "./get-percentage-diff"

describe("getPercentageDiff", () => {
  it("returns the percentage decrease from original to calculated", () => {
    expect(getPercentageDiff(100, 75)).toBe("25")
  })

  it("returns 0 when there is no change", () => {
    expect(getPercentageDiff(100, 100)).toBe("0")
  })

  it("returns a negative percentage when calculated is higher than original", () => {
    // Not a "decrease" at all — a price increase. The function doesn't
    // special-case this, so it comes back negative rather than clamped.
    expect(getPercentageDiff(100, 125)).toBe("-25")
  })
})
