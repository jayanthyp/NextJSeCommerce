import { expect, type Page } from "@playwright/test"

type ShippingDetails = {
  firstName: string
  lastName: string
  address: string
  postalCode: string
  city: string
  countryCode: string
  province: string
  email: string
}

export class CheckoutPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // --- Step 1: shipping address + delivery method (one combined screen) ----
  // Address and delivery share a single ?step=address screen — the "Continue
  // to payment" button submits both together (it's disabled until a
  // delivery method is selected), so fill the address, pick a delivery
  // method, then continue — no separate navigation in between.

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
    // StateSelect filters its options to the currently selected country, so
    // this has to run after the country select above, not before it — and
    // some regions (e.g. "au") reject an address update server-side without
    // a province even though the client-side isAddressComplete check doesn't
    // require one, which previously left the form stuck on step=address
    // with no visible error.
    await this.page
      .getByTestId("shipping-province-input")
      .selectOption(details.province)
    await this.page.getByTestId("shipping-email-input").fill(details.email)
  }

  marketingConsentCheckbox() {
    return this.page.getByTestId("marketing-consent-checkbox")
  }

  async checkMarketingConsent() {
    await this.marketingConsentCheckbox().click()
  }

  async selectDeliveryMethod(name: string) {
    // The address is auto-saved (debounced) once the form is complete, which
    // is what scopes the delivery-method list down to the cart's actual
    // region — wait for that to land before picking an option, rather than
    // racing a still-unscoped (or momentarily empty) list.
    const option = this.page
      .getByTestId("delivery-option-radio")
      .filter({ hasText: name })
    await expect(option).toHaveCount(1)
    await option.click()
  }

  async continueToPayment() {
    await this.page.getByTestId("submit-address-button").click()
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

  orderNoteInput() {
    return this.page.getByTestId("order-note-input")
  }

  async fillOrderNote(note: string) {
    await this.orderNoteInput().fill(note)
    // Debounced auto-save (500ms), matching the shipping-address pattern —
    // give it room to persist before placing the order.
    await this.page.waitForTimeout(700)
  }

  async placeOrder() {
    const placeOrder = this.page.getByTestId("submit-order-button")
    await expect(placeOrder).toBeEnabled()
    await placeOrder.click()
    // Order placement runs the whole payment-capture + order-creation
    // workflow server-side; give it more room than the per-step navigations.
    await this.page.waitForURL(/\/order\/.+\/confirmed/, { timeout: 20_000 })
  }
}
