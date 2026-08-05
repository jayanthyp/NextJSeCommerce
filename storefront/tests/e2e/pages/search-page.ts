import { expect, type Page } from "@playwright/test"

export class SearchPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async openAutocomplete() {
    await this.page.getByTestId("search-toggle-button").click()
    await expect(this.page.getByTestId("search-input")).toBeVisible()
  }

  async typeQuery(query: string) {
    await this.page.getByTestId("search-input").fill(query)
  }

  autocompleteHits() {
    return this.page.getByTestId("search-hit")
  }

  async submitViaEnter() {
    await this.page.getByTestId("search-input").press("Enter")
    await this.page.waitForURL(/\/search\?q=/)
  }

  async gotoResults(countryCode: string, query: string) {
    await this.page.goto(`/${countryCode}/search?q=${encodeURIComponent(query)}`)
  }

  resultHits() {
    return this.page.getByTestId("search-hit")
  }

  noResultsMessage() {
    return this.page.getByTestId("no-results")
  }
}
