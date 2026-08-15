import { test, expect } from "@playwright/test"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * Covers issue #28's category + price-range faceted filters on the store
 * catalog page. Reuses the same `small` breakpoint (1024px, see
 * tailwind.config.js) as sort-products.spec.ts for the desktop/mobile split.
 */
const MOBILE_VIEWPORT = { width: 375, height: 812 }
const DESKTOP_VIEWPORT = { width: 1280, height: 800 }

test.describe("Store filters", () => {
  test("shows a persistent sidebar on desktop and no mobile filters trigger", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: DESKTOP_VIEWPORT })
    const page = await context.newPage()
    await page.goto(`/${COUNTRY_CODE}/store`)

    await expect(page.getByTestId("filter-sidebar-desktop")).toBeVisible()
    await expect(page.getByTestId("mobile-filters-trigger")).not.toBeVisible()

    await context.close()
  })

  test("shows a Filters trigger instead of the sidebar on mobile", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT })
    const page = await context.newPage()
    await page.goto(`/${COUNTRY_CODE}/store`)

    await expect(page.getByTestId("mobile-filters-trigger")).toBeVisible()
    await expect(page.getByTestId("filter-sidebar-desktop")).not.toBeVisible()

    await context.close()
  })

  test("selecting a category on desktop updates the URL and the product grid", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: DESKTOP_VIEWPORT })
    const page = await context.newPage()
    await page.goto(`/${COUNTRY_CODE}/store`)

    const firstCategoryOption = page
      .getByTestId("category-filter-option")
      .first()
    await firstCategoryOption.getByRole("checkbox").check()

    await page.waitForURL(/category_id=/)
    await expect(page.getByTestId("products-list")).toBeVisible()

    await context.close()
  })

  test("clearing filters from the mobile drawer resets the URL", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT })
    const page = await context.newPage()
    await page.goto(`/${COUNTRY_CODE}/store`)

    await page.getByTestId("mobile-filters-trigger").click()
    const drawer = page.getByTestId("mobile-filters-drawer")
    await expect(drawer).toBeVisible()

    const firstCategoryOption = drawer
      .getByTestId("category-filter-option")
      .first()
    await firstCategoryOption.getByRole("checkbox").check()
    await page.waitForURL(/category_id=/)

    // Trigger badge reflects the active filter once the drawer is reopened.
    await page.getByTestId("mobile-filters-close").click()
    await expect(page.getByTestId("mobile-filters-badge")).toHaveText("1")

    await page.getByTestId("mobile-filters-trigger").click()
    await page.getByTestId("mobile-filters-clear").click()

    await page.waitForURL((url) => !url.search.includes("category_id"))
    await expect(page.getByTestId("mobile-filters-badge")).toHaveCount(0)

    await context.close()
  })
})
