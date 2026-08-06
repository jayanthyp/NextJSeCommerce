import { test, expect } from "@playwright/test"
import { ProductPage } from "./pages/product-page"
import { CartPage } from "./pages/cart-page"
import { CheckoutPage } from "./pages/checkout-page"
import { OrderConfirmationPage } from "./pages/order-confirmation-page"
import {
  COUNTRY_CODE,
  PRODUCT_HANDLE,
  DELIVERY_METHOD_NAME,
  PAYMENT_METHOD_NAME,
  uniqueTestCustomer,
} from "./fixtures/test-data"

/**
 * The marketing-consent checkbox on the checkout address step (see
 * shipping-address/index.tsx) captures a consent record and fires an
 * out-of-band MailerLite sync (marketing-consent-captured subscriber) — not
 * something Playwright can observe. What's actually testable end-to-end is
 * that the checkbox exists, defaults unchecked, and checking it doesn't
 * break checkout.
 */
test.describe("Marketing consent checkbox", () => {
  test("defaults unchecked and checking it does not block checkout", async ({
    page,
  }) => {
    const customer = uniqueTestCustomer()

    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)
    await productPage.selectFirstAvailableVariant()
    await productPage.addToCart()

    const cartPage = new CartPage(page)
    await cartPage.goto(COUNTRY_CODE)
    await cartPage.proceedToCheckout()

    const checkoutPage = new CheckoutPage(page)
    await expect(checkoutPage.marketingConsentCheckbox()).toHaveAttribute(
      "aria-checked",
      "false"
    )

    await checkoutPage.fillShippingAddress(customer)
    await checkoutPage.checkMarketingConsent()
    await expect(checkoutPage.marketingConsentCheckbox()).toHaveAttribute(
      "aria-checked",
      "true"
    )

    await checkoutPage.continueToDelivery()
    await checkoutPage.selectDeliveryMethod(DELIVERY_METHOD_NAME)
    await checkoutPage.continueToPayment()
    await checkoutPage.selectPaymentMethod(PAYMENT_METHOD_NAME)
    await checkoutPage.continueToReview()
    await checkoutPage.placeOrder()

    const confirmation = new OrderConfirmationPage(page)
    await confirmation.expectOrderConfirmed()
  })
})
