import { expect, type Page } from "@playwright/test"

export class CartPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto(countryCode: string) {
    await this.page.goto(`/${countryCode}/cart`)
  }

  async expectItemInCart(productTitle: string) {
    const row = this.page.getByTestId("product-row").filter({
      has: this.page.getByTestId("product-title").filter({ hasText: productTitle }),
    })
    await expect(row).toBeVisible()
  }

  async proceedToCheckout() {
    await this.page.getByTestId("checkout-button").click()
    await this.page.waitForURL(/\/checkout\?step=address/)
  }

  // --- Frequently bought together --------------------------------------------

  frequentlyBoughtTogether() {
    return this.page.getByTestId("frequently-bought-together")
  }

  async expectFrequentlyBoughtTogetherVisible() {
    await expect(this.frequentlyBoughtTogether()).toBeVisible()
  }

  async addAllSuggestedToCart() {
    const button = this.page.getByTestId("add-all-suggested-button")
    await button.click()
    // Adds are sequential (see add-all-button.tsx), so this is N Server
    // Action round trips back to back, not one — 15s was too tight under
    // CI's variable load and intermittently flaked here.
    await expect(button).toBeEnabled({ timeout: 30_000 })
  }
}
