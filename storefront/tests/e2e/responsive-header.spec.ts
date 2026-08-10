import { test, expect } from "@playwright/test"
import { ProductPage } from "./pages/product-page"
import { COUNTRY_CODE, COUNTRY_NAME, PRODUCT_HANDLE } from "./fixtures/test-data"

/**
 * The header's `small` breakpoint is 1024px (see tailwind.config.js) --
 * genuinely tablet-and-up, not a tiny phone-only cutoff -- so 375px is well
 * inside "collapsed" for every assertion below.
 */
const MOBILE_VIEWPORT = { width: 375, height: 812 }

test.describe("Responsive header", () => {
  test("nav menu collapses to a hamburger and the country selector shows flag-only on mobile", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT })
    const page = await context.newPage()

    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

    // Menu: the text label is hidden below `small`, but the button itself
    // (now icon-only) stays visible and operable.
    const menuButton = page.getByTestId("nav-menu-button")
    await expect(menuButton).toBeVisible()
    await expect(menuButton.getByText("Menu", { exact: true })).not.toBeVisible()
    await menuButton.click()
    await expect(page.getByTestId("nav-menu-popup")).toBeVisible()
    await page.getByTestId("close-menu-button").click()

    // Country selector: flag stays, the full country name text is hidden
    // (still present in the DOM for the `small`-and-up breakpoint, so check
    // visibility of the text itself rather than the button's textContent).
    const regionButton = page.getByTestId("region-switcher-button")
    await expect(regionButton).toBeVisible()
    await expect(regionButton.getByText(COUNTRY_NAME, { exact: true })).not.toBeVisible()
    // The name is still available non-visually.
    await expect(regionButton).toHaveAttribute("aria-label", new RegExp(COUNTRY_NAME))

    await context.close()
  })

  test("cart badge reflects item count and is hidden when empty", async ({ browser }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT })
    const page = await context.newPage()

    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

    const cartLink = page.getByTestId("nav-cart-link")
    await expect(page.getByTestId("cart-count-badge")).toHaveCount(0)
    await expect(cartLink).toHaveAttribute("aria-label", "0 items in cart")

    await productPage.selectFirstAvailableVariant()
    await productPage.addToCart()

    await expect(page.getByTestId("cart-count-badge")).toHaveText("1")
    await expect(cartLink).toHaveAttribute("aria-label", "1 item in cart")

    await context.close()
  })
})
