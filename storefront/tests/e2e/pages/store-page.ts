import { expect, type Page } from "@playwright/test"

export class StorePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto(countryCode: string) {
    await this.page.goto(`/${countryCode}/store`)
  }

  sortTrigger() {
    return this.page.getByTestId("sort-by-trigger")
  }

  async openSortMenu() {
    await this.sortTrigger().click()
    await expect(this.page.getByTestId("sort-by-options")).toBeVisible()
  }

  async selectSort(label: string) {
    await this.openSortMenu()
    await this.page.getByTestId("sort-by-option").filter({ hasText: label }).click()
  }

  async expectSortLabel(label: string) {
    await expect(this.sortTrigger()).toContainText(label)
  }
}
