import { test, expect } from "@playwright/test"
import { ProductPage } from "./pages/product-page"
import { CartPage } from "./pages/cart-page"
import { COUNTRY_CODE, SINGLE_VARIANT_PRODUCT_HANDLE } from "./fixtures/test-data"

/**
 * Quick add-to-cart from the catalog grid (issue #35).
 *
 * Single-variant products render a QuickAddButton on their catalog card so
 * shoppers can add to cart without opening the PDP. The button is
 * hover-revealed on desktop (≥1024px) and always-visible on mobile (<768px),
 * and it must not navigate to the PDP (the card is wrapped in a
 * LocalizedClientLink, so the button calls preventDefault/stopPropagation).
 *
 * Every other seeded product has real Size/Color options, so this targets
 * SINGLE_VARIANT_PRODUCT_HANDLE specifically — the one product in the
 * catalog with no variant options — rather than PRODUCT_HANDLE (the T-Shirt,
 * which has 8 variants and correctly never renders a quick-add button).
 */
test.describe("Quick add-to-cart from catalog grid", () => {
  test("adds a single-variant product to cart without opening the PDP", async ({
    page,
  }) => {
    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, SINGLE_VARIANT_PRODUCT_HANDLE)
    const productTitle = await productPage.getTitle()

    // Navigate to the store catalog grid, where ProductPreview cards render.
    await page.goto(`/${COUNTRY_CODE}/store`)

    // Find the card for the seeded product and its quick-add button.
    // The same product can appear in multiple rails (e.g. featured products
    // and the store grid), so scope to the store grid to avoid a strict-mode
    // violation from matching more than one card.
    const card = page
      .getByTestId("products-list")
      .getByTestId("product-wrapper")
      .filter({ has: page.getByTestId("product-title").filter({ hasText: productTitle }) })
    await expect(card).toBeVisible()

    const quickAdd = card.getByTestId("quick-add-button").first()
    // The desktop quick-add button is hover-revealed (opacity-0 until the
    // card is hovered), so hover the card before asserting visibility.
    await card.first().hover()
    await expect(quickAdd).toBeVisible()

    // Clicking quick-add must add to cart, not navigate to the PDP.
    await quickAdd.click()

    // The button disables itself while the add-to-cart Server Action is in
    // flight (isAdding); waiting for it to re-enable is a reliable signal
    // that the mutation completed.
    await expect(quickAdd).toBeEnabled({ timeout: 10_000 })

    // We should still be on the store grid, not the PDP.
    await expect(page).toHaveURL(new RegExp(`/${COUNTRY_CODE}/store`))

    // The cart should now contain the product.
    const cartPage = new CartPage(page)
    await cartPage.goto(COUNTRY_CODE)
    await cartPage.expectItemInCart(productTitle)
  })
})
