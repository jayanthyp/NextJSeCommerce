import { test, expect } from "@playwright/test"
import { StorePage } from "./pages/store-page"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * Sort control on /store — replaced a full-height sidebar radio list with a
 * compact dropdown next to the results header (see
 * src/modules/store/components/refinement-list/sort-products), matching how
 * most storefronts place sort next to the product count/title rather than
 * dedicating a whole sidebar column to it.
 */
test.describe("Store sort", () => {
  test("defaults to Latest Arrivals and changing it updates the URL and re-sorts", async ({
    page,
  }) => {
    const store = new StorePage(page)
    await store.goto(COUNTRY_CODE)

    await store.expectSortLabel("Latest Arrivals")

    await store.selectSort("Price: Low to High")
    await store.expectSortLabel("Price: Low to High")
    await expect(page).toHaveURL(/sortBy=price_asc/)

    await store.selectSort("Price: High to Low")
    await store.expectSortLabel("Price: High to Low")
    await expect(page).toHaveURL(/sortBy=price_desc/)
  })
})
