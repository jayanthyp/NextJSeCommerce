import { test, expect } from "@playwright/test"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * Catalog product images should lazy-load (issue #95). The storefront's
 * catalog grid renders each product via the Thumbnail component, whose
 * <Image> tag must carry loading="lazy" so below-the-fold images defer
 * loading until they scroll into view.
 */
test.describe("Catalog product image lazy loading", () => {
  test("catalog product images render with loading=lazy", async ({ page }) => {
    await page.goto(`/${COUNTRY_CODE}/store`)

    const lazyImages = page.locator('img[loading="lazy"]')
    await expect(lazyImages.first()).toBeVisible()
    expect(await lazyImages.count()).toBeGreaterThan(0)
  })
})
