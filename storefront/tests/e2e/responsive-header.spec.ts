import { test, expect } from "@playwright/test"
import { ProductPage } from "./pages/product-page"
import { COUNTRY_CODE, PRODUCT_HANDLE } from "./fixtures/test-data"

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
    await expect(regionButton.getByText("Germany", { exact: true })).not.toBeVisible()
    // The name is still available non-visually.
    await expect(regionButton).toHaveAttribute("aria-label", /Germany/)

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

  test("utility icons render as a 2x2 grid on mobile and a single row on desktop", async ({
    browser,
  }) => {
    const mobileContext = await browser.newContext({ viewport: MOBILE_VIEWPORT })
    const mobilePage = await mobileContext.newPage()
    const mobileProductPage = new ProductPage(mobilePage)
    await mobileProductPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

    await expect(mobilePage.getByTestId("nav-utilities")).toHaveCSS("display", "grid")
    await mobileContext.close()

    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    const desktopPage = await desktopContext.newPage()
    const desktopProductPage = new ProductPage(desktopPage)
    await desktopProductPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

    await expect(desktopPage.getByTestId("nav-utilities")).toHaveCSS("display", "flex")
    await desktopContext.close()
  })

  test("side menu opens as a partial drawer, not a full-screen takeover", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT })
    const page = await context.newPage()
    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

    await page.getByTestId("nav-menu-button").click()
    const panel = page.getByTestId("nav-menu-popup")
    await expect(panel).toBeVisible()

    const panelBox = await panel.boundingBox()
    expect(panelBox).not.toBeNull()
    // 80%-of-375px viewport, capped at 360px -- well short of full-width.
    expect(panelBox!.width).toBeLessThan(MOBILE_VIEWPORT.width * 0.9)

    await context.close()
  })

  test("side menu closes on backdrop click and on Escape", async ({ browser }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT })
    const page = await context.newPage()
    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

    await page.getByTestId("nav-menu-button").click()
    await expect(page.getByTestId("nav-menu-popup")).toBeVisible()
    // Click the backdrop itself, not the panel -- force past the panel's
    // overlapping hit area at the very edge of the viewport.
    await page.getByTestId("side-menu-backdrop").click({ position: { x: 350, y: 20 }, force: true })
    await expect(page.getByTestId("nav-menu-popup")).not.toBeVisible()

    await page.getByTestId("nav-menu-button").click()
    await expect(page.getByTestId("nav-menu-popup")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("nav-menu-popup")).not.toBeVisible()

    await context.close()
  })

  test("side menu traps focus while open", async ({ browser }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT })
    const page = await context.newPage()
    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

    await page.getByTestId("nav-menu-button").click()
    const panel = page.getByTestId("nav-menu-popup")
    await expect(panel).toBeVisible()

    // Tab far more times than there are focusable elements in the panel --
    // if focus were escaping, it would land outside the panel eventually.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab")
      await expect(panel.locator(":focus")).toHaveCount(1)
    }

    await context.close()
  })
})
