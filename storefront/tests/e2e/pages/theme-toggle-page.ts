import { type Locator, type Page } from "@playwright/test"

export class ThemeTogglePage {
  readonly page: Page
  readonly toggleButton: Locator

  constructor(page: Page) {
    this.page = page
    this.toggleButton = page.getByTestId("theme-toggle-button")
  }

  async goto(countryCode: string) {
    await this.page.goto(`/${countryCode}`)
  }

  async isDark(): Promise<boolean> {
    return this.page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    )
  }

  async toggle() {
    await this.toggleButton.click()
  }
}
