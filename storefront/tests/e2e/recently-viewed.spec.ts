import { test, expect } from "@playwright/test"
import { ProductPage } from "./pages/product-page"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * Recently viewed is client-side/localStorage only (see
 * src/lib/hooks/use-recently-viewed.ts) — no backend module, so this is a
 * pure browser-state test. The section only renders once there's at least
 * one *other* recently viewed product, so the first product visited in a
 * session shows nothing.
 */
test.describe("Recently viewed", () => {
  test("does not show on the first product viewed in a session", async ({ page }) => {
    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, "t-shirt")

    await expect(page.getByTestId("recently-viewed")).toHaveCount(0)
  })

  test("shows a previously viewed product after visiting a second one", async ({ page }) => {
    const productPage = new ProductPage(page)

    await productPage.goto(COUNTRY_CODE, "t-shirt")
    const firstTitle = await productPage.getTitle()

    await productPage.goto(COUNTRY_CODE, "sweatshirt")

    const recentlyViewed = page.getByTestId("recently-viewed")
    await expect(recentlyViewed).toBeVisible()
    await expect(recentlyViewed.getByText(firstTitle)).toBeVisible()
  })
})
