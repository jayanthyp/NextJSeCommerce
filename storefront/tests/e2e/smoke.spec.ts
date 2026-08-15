import { test, expect } from "@playwright/test"
import { ProductPage } from "./pages/product-page"
import { CartPage } from "./pages/cart-page"
import { COUNTRY_CODE, PRODUCT_HANDLE } from "./fixtures/test-data"

/**
 * QA baseline smoke suite — the tiny, always-run floor for the change-scoped QA
 * node (see src/agents/nodes.ts qualityAnalystNode). These three tests assert
 * only the "does the app build, render, and sell" core, so any failure here is
 * a genuine core-UI break, never an unrelated regression. The full feature
 * regression suite runs separately (a scheduled non-prod run), not in the
 * autonomous loop.
 */
test.describe("Smoke", () => {
  test("storefront boots and the catalog renders seeded products", async ({ page }) => {
    await page.goto(`/${COUNTRY_CODE}/store`)
    await expect(page.getByTestId("store-page-title")).toBeVisible()
    const list = page.getByTestId("products-list")
    await expect(list).toBeVisible()
    // At least one seeded product card — catches an empty catalog (the failure
    // mode that surfaced when the seed region scripts were missing).
    await expect(list.getByTestId("product-wrapper").first()).toBeVisible()
  })

  test("a product detail page renders its options and add-to-cart", async ({ page }) => {
    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)
    await expect(page.getByTestId("product-container")).toBeVisible()
    await expect(page.getByTestId("product-options").first()).toBeVisible()
  })

  test("a mock item can be added to the cart", async ({ page }) => {
    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)
    await productPage.selectFirstAvailableVariant()
    await productPage.addToCart()

    // The add-to-cart Server Action → Medusa → event-bus round trip has
    // completed and the cart now holds one item.
    await expect(page.getByTestId("cart-count-badge")).toHaveText("1")

    const cartPage = new CartPage(page)
    await cartPage.goto(COUNTRY_CODE)
    await expect(page.getByTestId("product-row")).toBeVisible()
  })
})
