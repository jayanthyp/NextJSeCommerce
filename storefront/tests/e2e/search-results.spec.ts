import { test, expect } from "@playwright/test"
import { SearchPage } from "./pages/search-page"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * Coverage for the /search results page (issue #129: search returned zero
 * results in production for valid keywords, because the MeiliSearch index
 * was empty and the public /search proxy route hadn't reloaded -- both
 * root-caused and fixed outside the storefront itself, but nothing here
 * ever exercised the real results page, so a regression of either would
 * have gone undetected again).
 *
 * Requires the real MeiliSearch service to be up and the seed products
 * indexed, same as search-input.spec.ts.
 */
test.describe("Search results page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/${COUNTRY_CODE}`)
    const toggle = page.getByTestId("search-toggle-button")
    test.skip(
      (await toggle.count()) === 0,
      "Search is not configured in this environment (NEXT_PUBLIC_SEARCH_ENDPOINT/API_KEY unset)"
    )
  })

  test("a known seeded keyword returns matching products", async ({ page }) => {
    const search = new SearchPage(page)
    await search.gotoResults(COUNTRY_CODE, "Shirt")

    await expect(page.getByTestId("search-page-title")).toContainText("Shirt")
    await expect(search.resultHits().first()).toBeVisible()
  })

  test("a nonsense query renders the empty state, not an error", async ({
    page,
  }) => {
    const search = new SearchPage(page)
    await search.gotoResults(COUNTRY_CODE, "zzzznoresultsxyz")

    await expect(search.noResultsMessage()).toBeVisible()
    await expect(search.noResultsMessage()).toContainText("zzzznoresultsxyz")
    await expect(search.resultHits()).toHaveCount(0)
  })
})
