import { test, expect } from "@playwright/test"
import { ProductPage } from "./pages/product-page"
import { CartPage } from "./pages/cart-page"
import { COUNTRY_CODE, PRODUCT_HANDLE } from "./fixtures/test-data"

/**
 * Cart "frequently bought together" — v1 falls back to same-region product
 * suggestions when the cart's seed item has no collection/tags to match on
 * (see src/modules/cart/components/frequently-bought-together), which is
 * exactly the seed catalog's shape (no collections/tags assigned), so the
 * other seeded products are expected to show up as suggestions.
 */
test.describe("Frequently bought together", () => {
  test("suggests other products in the cart and can add them all at once", async ({
    page,
  }) => {
    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)
    await productPage.selectFirstAvailableVariant()
    await productPage.addToCart()

    const cartPage = new CartPage(page)
    await cartPage.goto(COUNTRY_CODE)
    await cartPage.expectFrequentlyBoughtTogetherVisible()

    const fbt = cartPage.frequentlyBoughtTogether()
    const suggestionCount = await fbt.getByTestId("product-wrapper").count()
    expect(suggestionCount).toBeGreaterThan(0)

    await cartPage.addAllSuggestedToCart()

    // Cart should now hold the original item plus every suggested product.
    const rows = page.getByTestId("product-row")
    await expect(rows).toHaveCount(suggestionCount + 1, { timeout: 15_000 })
  })
})
