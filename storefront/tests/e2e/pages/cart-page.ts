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
}
