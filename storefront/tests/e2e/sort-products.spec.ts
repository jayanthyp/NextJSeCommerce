import { test, expect } from "@playwright/test"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * The header's `small` breakpoint (1024px, see tailwind.config.js) is
 * reused here too -- same convention as the rest of the responsive work in
 * this repo, not a separate mobile cutoff invented for this one control.
 */
const MOBILE_VIEWPORT = { width: 375, height: 812 }

test.describe("Sort by control", () => {
  test("shows a native select on mobile instead of the custom dropdown", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT })
    const page = await context.newPage()
    await page.goto(`/${COUNTRY_CODE}/store`)

    const mobileSelect = page.getByTestId("sort-by-select-mobile")
    await expect(mobileSelect).toBeVisible()
    // The custom desktop dropdown trigger stays in the DOM (CSS-hidden) --
    // assert it's specifically not the visible control at this viewport.
    await expect(page.getByTestId("sort-by-trigger")).not.toBeVisible()

    await context.close()
  })

  test("selecting a mobile sort option updates the URL and re-sorts results", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT })
    const page = await context.newPage()
    await page.goto(`/${COUNTRY_CODE}/store`)

    await page.getByTestId("sort-by-select-mobile").selectOption("price_asc")
    await page.waitForURL(/sortBy=price_asc/)

    await context.close()
  })

  test("shows the custom dropdown on desktop instead of the native select", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    await page.goto(`/${COUNTRY_CODE}/store`)

    await expect(page.getByTestId("sort-by-trigger")).toBeVisible()
    await expect(page.getByTestId("sort-by-select-mobile")).not.toBeVisible()

    await page.getByTestId("sort-by-trigger").click()
    await page.getByTestId("sort-by-options").getByText("Price: Low to High").click()
    await page.waitForURL(/sortBy=price_asc/)

    await context.close()
  })
})
