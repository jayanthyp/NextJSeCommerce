import { expect, type Page } from "@playwright/test"

export class WishlistPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // --- Product detail page -------------------------------------------------

  productWishlistButton() {
    return this.page.getByTestId("wishlist-button")
  }

  async toggleFromProductPage() {
    const button = this.productWishlistButton()
    await expect(button).toBeVisible()
    await button.click()
  }

  // --- Account nav -----------------------------------------------------------

  /** The nav link that opens the wishlist page — desktop and mobile share
   * the testid, only one is visible per viewport (see account-nav). */
  async openFromNav() {
    await this.page.getByTestId("wishlist-link").first().click()
    await this.page.waitForURL(/\/account\/wishlist$/)
  }

  // --- Account wishlist page ------------------------------------------------

  async goto(countryCode: string) {
    await this.page.goto(`/${countryCode}/account/wishlist`)
  }

  itemCount() {
    return this.page.getByTestId("remove-wishlist-item").count()
  }

  async removeFirstItem() {
    await this.page.getByTestId("remove-wishlist-item").first().click()
  }

  async copyShareLink(): Promise<string> {
    await this.page.context().grantPermissions(["clipboard-read", "clipboard-write"])
    await this.page.getByRole("button", { name: /copy shareable link/i }).click()
    await expect(
      this.page.getByRole("button", { name: /link copied/i })
    ).toBeVisible()
    return this.page.evaluate(() => navigator.clipboard.readText())
  }
}
