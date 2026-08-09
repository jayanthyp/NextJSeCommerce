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
    // Default 30s test timeout leaves no headroom for the row-count
    // assertion's own 45s wait below (adds are sequential Server Action
    // round trips — see add-all-button.tsx and cart-page.ts) — extend this
    // one test rather than the global default, since nothing else in this
    // suite does a multi-item sequential write like this.
    test.setTimeout(60_000)

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
    // Adds are sequential Server Action round trips (see add-all-button.tsx),
    // so this genuinely takes longer under CI's variable load as suggestion
    // count grows — this assertion (not the button's own loading state) is
    // the actual success condition, so it carries the generous timeout.
    const rows = page.getByTestId("product-row")
    await expect(rows).toHaveCount(suggestionCount + 1, { timeout: 45_000 })
  })
})
