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

test.describe("Order note at checkout", () => {
  test("an optional note left at review persists to the order confirmation", async ({
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
    await checkoutPage.fillShippingAddress(customer)
    await checkoutPage.selectDeliveryMethod(DELIVERY_METHOD_NAME)
    await checkoutPage.continueToPayment()
    await checkoutPage.selectPaymentMethod(PAYMENT_METHOD_NAME)
    await checkoutPage.continueToReview()

    await expect(checkoutPage.orderNoteInput()).toHaveValue("")
    await checkoutPage.fillOrderNote("Please gift-wrap, leave with security")

    await checkoutPage.placeOrder()

    const confirmation = new OrderConfirmationPage(page)
    await confirmation.expectOrderConfirmed()
    await confirmation.expectOrderNote("Please gift-wrap, leave with security")
  })

  test("checkout succeeds with no note left at all", async ({ page }) => {
    const customer = uniqueTestCustomer()

    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)
    await productPage.selectFirstAvailableVariant()
    await productPage.addToCart()

    const cartPage = new CartPage(page)
    await cartPage.goto(COUNTRY_CODE)
    await cartPage.proceedToCheckout()

    const checkoutPage = new CheckoutPage(page)
    await checkoutPage.fillShippingAddress(customer)
    await checkoutPage.selectDeliveryMethod(DELIVERY_METHOD_NAME)
    await checkoutPage.continueToPayment()
    await checkoutPage.selectPaymentMethod(PAYMENT_METHOD_NAME)
    await checkoutPage.continueToReview()
    await checkoutPage.placeOrder()

    const confirmation = new OrderConfirmationPage(page)
    await confirmation.expectOrderConfirmed()
  })
})
