import { describe, expect, it } from "vitest"
import robots from "./robots"

describe("robots", () => {
  it("allows crawling but blocks cart/checkout/account, and points to the sitemap", () => {
    const result = robots()

    expect(result.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/*/cart", "/*/checkout", "/*/account"],
    })
    expect(result.sitemap).toBe("https://localhost:8000/sitemap.xml")
  })
})
