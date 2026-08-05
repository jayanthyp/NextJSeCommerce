import { test, expect } from "@playwright/test"
import { COUNTRY_CODE, PRODUCT_HANDLE } from "./fixtures/test-data"

test.describe("SEO fundamentals", () => {
  test("sitemap.xml is served and includes the seeded product", async ({
    page,
  }) => {
    const response = await page.goto("/sitemap.xml")
    expect(response?.status()).toBe(200)

    const body = await page.content()
    expect(body).toContain(`/${COUNTRY_CODE}/products/${PRODUCT_HANDLE}`)
  })

  test("robots.txt is served and references the sitemap", async ({
    page,
  }) => {
    const response = await page.goto("/robots.txt")
    expect(response?.status()).toBe(200)

    const body = await page.content()
    expect(body).toContain("sitemap.xml")
  })

  test("product page renders valid schema.org/Product JSON-LD", async ({
    page,
  }) => {
    await page.goto(`/${COUNTRY_CODE}/products/${PRODUCT_HANDLE}`)

    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent()

    expect(jsonLd).toBeTruthy()
    const parsed = JSON.parse(jsonLd!)
    expect(parsed["@type"]).toBe("Product")
    expect(parsed.name).toBeTruthy()
    expect(parsed.offers?.priceCurrency).toBeTruthy()
  })
})
