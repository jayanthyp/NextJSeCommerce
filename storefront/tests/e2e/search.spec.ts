import { test, expect } from "@playwright/test"
import { SearchPage } from "./pages/search-page"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * MeiliSearch-backed search: header autocomplete and the full results page.
 * Requires the real MeiliSearch service to be up and the seed products
 * indexed — see .github/workflows/test.yml's "Wait for the seeded products
 * to reach the MeiliSearch index" step. If NEXT_PUBLIC_SEARCH_ENDPOINT/
 * NEXT_PUBLIC_SEARCH_API_KEY aren't set, search is disabled entirely and
 * these are skipped rather than false-failing.
 */
test.describe("Search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/${COUNTRY_CODE}`)
    const toggle = page.getByTestId("search-toggle-button")
    test.skip(
      (await toggle.count()) === 0,
      "Search is not configured in this environment (NEXT_PUBLIC_SEARCH_ENDPOINT/API_KEY unset)"
    )
  })

  test("header autocomplete returns typo-tolerant results", async ({ page }) => {
    const search = new SearchPage(page)
    await search.openAutocomplete()

    // Deliberate typo ("Shrit" for "Shirt") — MeiliSearch's typo tolerance
    // should still surface the seeded "Medusa T-Shirt".
    await search.typeQuery("Shrit")
    await expect(search.autocompleteHits().first()).toBeVisible({ timeout: 10_000 })
  })

  test("submitting a query navigates to the full results page", async ({ page }) => {
    const search = new SearchPage(page)
    await search.openAutocomplete()
    await search.typeQuery("Shirt")
    await expect(search.autocompleteHits().first()).toBeVisible({ timeout: 10_000 })
    await search.submitViaEnter()

    await expect(page.getByTestId("search-page-title")).toContainText("Shirt")
    await expect(search.resultHits().first()).toBeVisible()
  })

  test("shows a no-results message for a query matching nothing", async ({ page }) => {
    const search = new SearchPage(page)
    await search.gotoResults(COUNTRY_CODE, "zzzzznonexistentproductzzzzz")
    await expect(search.noResultsMessage()).toBeVisible({ timeout: 10_000 })
  })
})
