import { test, expect } from "@playwright/test"
import { ProductPage } from "./pages/product-page"
import { AuthPage } from "./pages/auth-page"
import { WishlistPage } from "./pages/wishlist-page"
import { COUNTRY_CODE, PRODUCT_HANDLE, uniqueTestAccount } from "./fixtures/test-data"

/**
 * Wishlist quick-action on product catalog cards (issue #30).
 *
 * The grid card heart button is a separate component from the PDP's
 * WishlistButton (see src/modules/products/components/product-preview/wishlist-quick-action.tsx),
 * so this spec exercises the catalog-card path specifically: guest-visible
 * toggle, optimistic fill, and the mobile hit-area container.
 */
test.describe("Wishlist quick-action on product cards", () => {
  test("guest can toggle the heart on a catalog card without navigating", async ({
    page,
  }) => {
    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

    // The quick-action lives on the product-preview card (related-products
    // carousel reuses the same component/testid), so scope to the first card.
    const card = page.getByTestId("product-wrapper").first()
    const quickAction = card.getByTestId("wishlist-quick-action")

    await expect(quickAction).toBeVisible()
    await expect(quickAction).toHaveAttribute("aria-label", "Add to wishlist")

    // Tapping the heart must not navigate to the PDP (the whole card is a link).
    await quickAction.click()
    await expect(quickAction).toHaveAttribute("aria-label", "Remove from wishlist")

    // Still on the same page — the click was intercepted.
    await expect(page).toHaveURL(new RegExp(`/${COUNTRY_CODE}/products/${PRODUCT_HANDLE}$`))
  })

  test("signed-in customer's card toggle persists to the account wishlist", async ({
    page,
  }) => {
    const auth = new AuthPage(page)
    await auth.registerNewCustomer(COUNTRY_CODE, uniqueTestAccount())

    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)
    const productTitle = await productPage.getTitle()

    const card = page.getByTestId("product-wrapper").first()
    const quickAction = card.getByTestId("wishlist-quick-action")

    await quickAction.click()
    await expect(quickAction).toHaveAttribute("aria-label", "Remove from wishlist")

    // The persisted wishlist should now contain the product.
    const wishlist = new WishlistPage(page)
    await wishlist.goto(COUNTRY_CODE)
    await expect(page.getByText(productTitle)).toBeVisible()
  })

  test("mobile card heart has a 44px hit area", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()

    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

    const card = page.getByTestId("product-wrapper").first()
    const quickAction = card.getByTestId("wishlist-quick-action")

    await expect(quickAction).toBeVisible()

    // The hit-area container guarantees a 44px touch target even though the
    // visual circle is 32px (see wishlist-quick-action.tsx).
    const box = await quickAction.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)

    await context.close()
  })
})
