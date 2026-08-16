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
    // Single-variant products (e.g. the quick-add seed product) have no
    // variant options, so this assertion is skipped when none are present.
    const options = this.container.getByTestId("product-options")
    if ((await options.count()) > 0) {
      await expect(options.first()).toBeVisible()
    }
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
    await expect(this.addToCartButton).toBeEnabled({ timeout: 10_000 })
  }
}
