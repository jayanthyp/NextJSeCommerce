import { test, expect } from "@playwright/test"
import { SearchPage } from "./pages/search-page"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * Regression coverage for issue #117: the storefront search field did not
 * accept keyboard input (rendered non-editable / overlaid by another UI
 * element intercepting focus and keystrokes). These tests assert the input
 * actually receives typed text on both desktop and mobile viewports, and
 * that the existing query-submission/navigation behavior still works.
 *
 * Requires the real MeiliSearch service to be up and the seed products
 * indexed — see .github/workflows/test.yml's "Wait for the seeded products
 * to reach the MeiliSearch index" step. If NEXT_PUBLIC_SEARCH_ENDPOINT/
 * NEXT_PUBLIC_SEARCH_API_KEY aren't set, search is disabled entirely and
 * these are skipped rather than false-failing.
 */
test.describe("Search input", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/${COUNTRY_CODE}`)
    const toggle = page.getByTestId("search-toggle-button")
    test.skip(
      (await toggle.count()) === 0,
      "Search is not configured in this environment (NEXT_PUBLIC_SEARCH_ENDPOINT/API_KEY unset)"
    )
  })

  test("accepts typed text on desktop", async ({ page }) => {
    const search = new SearchPage(page)
    await search.openAutocomplete()

    const input = search.searchInput()
    await input.click()
    await input.fill("Shirt")

    // The field must actually hold the typed value — the original bug left
    // it empty because the input was non-editable / focus was intercepted.
    await expect(input).toHaveValue("Shirt")
  })

  test("accepts typed text on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 }) // Pixel 5

    const search = new SearchPage(page)
    await search.openAutocomplete()

    const input = search.searchInput()
    await input.click()
    await input.fill("Shirt")

    await expect(input).toHaveValue("Shirt")
  })

  test("typed text still drives query submission and navigation", async ({
    page,
  }) => {
    const search = new SearchPage(page)
    await search.openAutocomplete()

    const input = search.searchInput()
    await input.click()
    await input.fill("Shirt")
    await expect(input).toHaveValue("Shirt")

    await search.submitViaEnter()

    await expect(page.getByTestId("search-page-title")).toContainText("Shirt")
    await expect(search.resultHits().first()).toBeVisible()
  })
})
