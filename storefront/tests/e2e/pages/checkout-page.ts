import { expect, type Page } from "@playwright/test"

type ShippingDetails = {
  firstName: string
  lastName: string
  address: string
  postalCode: string
  city: string
  countryCode: string
  email: string
}

export class CheckoutPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // --- Step 1: shipping address -------------------------------------------

  async fillShippingAddress(details: ShippingDetails) {
    await expect(this.page.getByTestId("shipping-first-name-input")).toBeVisible()
    await this.page.getByTestId("shipping-first-name-input").fill(details.firstName)
    await this.page.getByTestId("shipping-last-name-input").fill(details.lastName)
    await this.page.getByTestId("shipping-address-input").fill(details.address)
    await this.page.getByTestId("shipping-postal-code-input").fill(details.postalCode)
    await this.page.getByTestId("shipping-city-input").fill(details.city)
    await this.page
      .getByTestId("shipping-country-select")
      .selectOption(details.countryCode)
    await this.page.getByTestId("shipping-email-input").fill(details.email)
  }

  async continueToDelivery() {
    await this.page.getByTestId("submit-address-button").click()
    await this.page.waitForURL(/step=delivery/)
  }

  // --- Step 2: delivery method ---------------------------------------------

  async selectDeliveryMethod(name: string) {
    await this.page
      .getByTestId("delivery-option-radio")
      .filter({ hasText: name })
      .click()
  }

  async continueToPayment() {
    await this.page.getByTestId("submit-delivery-option-button").click()
    await this.page.waitForURL(/step=payment/)
  }

  // --- Step 3: payment -------------------------------------------------------

  async selectPaymentMethod(name: string) {
    await this.page.getByRole("radio", { name }).click()
  }

  async continueToReview() {
    await this.page.getByTestId("submit-payment-button").click()
    await this.page.waitForURL(/step=review/)
  }

  // --- Step 4: review + place order ------------------------------------------

  async placeOrder() {
    const placeOrder = this.page.getByTestId("submit-order-button")
    await expect(placeOrder).toBeEnabled()
    await placeOrder.click()
    // Order placement runs the whole payment-capture + order-creation
    // workflow server-side; give it more room than the per-step navigations.
    await this.page.waitForURL(/\/order\/.+\/confirmed/, { timeout: 30_000 })
  }
}
