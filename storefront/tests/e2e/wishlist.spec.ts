import { test, expect } from "@playwright/test"
import { ProductPage } from "./pages/product-page"
import { AuthPage } from "./pages/auth-page"
import { WishlistPage } from "./pages/wishlist-page"
import { COUNTRY_CODE, PRODUCT_HANDLE, uniqueTestAccount } from "./fixtures/test-data"

/**
 * Wishlist: add/remove from the product page, view in the account dashboard,
 * and share via a public link. Also covers the mobile-viewport nav path
 * specifically, since account-nav duplicates its link list between a
 * desktop sidebar and a separate mobile drawer — easy for one to silently
 * miss a new entry (see storefront/src/modules/account/components/account-nav).
 */
test.describe("Wishlist", () => {
  test("signed-out visitors don't see a wishlist button", async ({ page }) => {
    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

    const wishlist = new WishlistPage(page)
    await expect(wishlist.productWishlistButton()).toHaveCount(0)
  })

  test("signed-in customer can add, view, remove, and share wishlist items", async ({
    page,
  }) => {
    const auth = new AuthPage(page)
    await auth.registerNewCustomer(COUNTRY_CODE, uniqueTestAccount())

    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)
    const productTitle = await productPage.getTitle()

    const wishlist = new WishlistPage(page)
    await wishlist.toggleFromProductPage()
    await expect(wishlist.productWishlistButton()).toHaveAttribute(
      "aria-label",
      "Remove from wishlist"
    )

    await wishlist.goto(COUNTRY_CODE)
    await expect(page.getByText(productTitle)).toBeVisible()

    const shareUrl = await wishlist.copyShareLink()
    expect(shareUrl).toContain(`/wishlist/shared/`)

    await wishlist.removeFirstItem()
    await expect(page.getByText("Your wishlist is empty.")).toBeVisible()

    // The share link stays valid even after the wishlist is emptied out —
    // it should just show nothing rather than error.
    await page.goto(shareUrl)
    await expect(
      page.getByText(/empty or the link is no longer valid/i)
    ).toBeVisible()
  })

  test("wishlist nav link is reachable from the mobile drawer", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()

    const auth = new AuthPage(page)
    await auth.registerNewCustomer(COUNTRY_CODE, uniqueTestAccount())

    const wishlist = new WishlistPage(page)
    const mobileLink = page.getByTestId("mobile-account-nav").getByTestId("wishlist-link")
    await expect(mobileLink).toBeVisible()
    await mobileLink.click()
    await page.waitForURL(/\/account\/wishlist$/)
    await expect(page.getByTestId("wishlist-page-wrapper")).toBeVisible()

    await context.close()
  })
})
