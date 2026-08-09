import { expect, type Locator, type Page } from "@playwright/test"

export class ProductPage {
  readonly page: Page
  /** Scopes every locator below to the main product detail area — the page
   * also renders a "related products" carousel using the same component
   * (and therefore the same testids) further down, which would otherwise
   * make every locator here ambiguous. */
  readonly container: Locator
  readonly optionButtons: Locator
  readonly addToCartButton: Locator
  readonly title: Locator

  constructor(page: Page) {
    this.page = page
    this.container = page.getByTestId("product-container")
    this.optionButtons = this.container.getByTestId("option-button")
    this.addToCartButton = this.container.getByTestId("add-product-button")
    this.title = this.container.getByTestId("product-title")
  }

  async goto(countryCode: string, handle: string) {
    await this.page.goto(`/${countryCode}/products/${handle}`)
    // One "product-options" block per variant option (Size, Color, ...) —
    // the storefront gives them all the same testid, so this only asserts
    // the first has rendered rather than requiring a single unique match.
    // Default 5000ms timeout was too tight for cold SSR + CI runner load and
    // caused unrelated specs to time out here rather than at their own
    // assertions (root-caused on issue #33 after 2 consecutive storefront-e2e
    // runs failed the same 14 tests across 7 unrelated specs).
    await expect(this.container.getByTestId("product-options").first()).toBeVisible({ timeout: 15000 })
  }

  async getTitle(): Promise<string> {
    return (await this.title.textContent())?.trim() ?? ""
  }

  /**
   * Clicks the first available value for every variant option group (size,
   * color, ...). The storefront disables "Add to cart" until a value is
   * selected for every group, so this has to run before addToCart().
   */
  async selectFirstAvailableVariant() {
    const count = await this.optionButtons.count()
    for (let i = 0; i < count; i++) {
      const button = this.optionButtons.nth(i)
      if (await button.isEnabled()) {
        await button.click()
      }
    }
  }

  async addToCart() {
    await expect(this.addToCartButton).toBeEnabled()
    await this.addToCartButton.click()
    // The button disables itself while the add-to-cart Server Action is in
    // flight (isAdding); waiting for it to re-enable is a reliable signal
    // that the mutation actually completed, instead of a fixed sleep. The
    // round trip goes through the Server Action, the Medusa API, and the
    // Redis-backed event bus, so give it more than the 5s default.
    await expect(this.addToCartButton).toBeEnabled({ timeout: 15_000 })
  }
}
