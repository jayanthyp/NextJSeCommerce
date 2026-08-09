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
    // Deliberately not waiting on the button re-enabling here: adds are
    // sequential (see add-all-button.tsx), and how long that intermediate
    // loading state lasts under CI's variable load isn't actually what this
    // flow needs to guarantee — the cart reaching its final item count is.
    // Gating on the button's disabled→enabled transition instead added a
    // second, tighter timeout on top of that real one and was the actual
    // source of this test's repeated flakiness (see git history on this
    // file/frequently-bought-together.spec.ts) despite several rounds of
    // raising it. The caller's row-count assertion is the real success
    // condition and already has its own generous timeout.
  }
}
