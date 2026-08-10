import { test, expect } from "@playwright/test"
import { ProductPage } from "./pages/product-page"
import { CartPage } from "./pages/cart-page"
import { CheckoutPage } from "./pages/checkout-page"
import { OrderConfirmationPage } from "./pages/order-confirmation-page"
import {
  COUNTRY_CODE,
  PRODUCT_HANDLE,
  DELIVERY_METHOD_NAME,
  COD_PAYMENT_METHOD_NAME,
  uniqueTestCustomer,
} from "./fixtures/test-data"

/**
 * Cash on Delivery checkout (issue #64).
 *
 * Verifies the COD payment method is selectable at the payment step (it's
 * attached to the AU region the fixture checks out in) and that placing the
 * order with COD succeeds — no online capture is attempted, and the order
 * confirmation reports "Cash on Delivery" as the payment method.
 *
 * Same live-backend, no-mock approach as order-journey.spec.ts; e2e is run
 * by the quality-analyst agent, not the dev loop.
 */
test.describe("Cash on Delivery checkout", () => {
  test("customer can place an order paying on delivery", async ({ page }) => {
    const customer = uniqueTestCustomer()
    let productTitle = ""

    await test.step("Add product to cart", async () => {
      const productPage = new ProductPage(page)
      await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)
      productTitle = await productPage.getTitle()
      expect(productTitle).not.toBe("")

      await productPage.selectFirstAvailableVariant()
      await productPage.addToCart()
    })

    await test.step("Cart reflects the added item", async () => {
      const cartPage = new CartPage(page)
      await cartPage.goto(COUNTRY_CODE)
      await cartPage.expectItemInCart(productTitle)
      await cartPage.proceedToCheckout()
    })

    const checkoutPage = new CheckoutPage(page)

    await test.step("Fill shipping address and select delivery method", async () => {
      await checkoutPage.fillShippingAddress(customer)
      await checkoutPage.selectDeliveryMethod(DELIVERY_METHOD_NAME)
      await checkoutPage.continueToPayment()
    })

    await test.step("Select Cash on Delivery as the payment method", async () => {
      await checkoutPage.selectPaymentMethod(COD_PAYMENT_METHOD_NAME)
      await checkoutPage.continueToReview()
    })

    await test.step("Place the COD order (no online capture)", async () => {
      await checkoutPage.placeOrder()
    })

    await test.step("Order confirmation shows Cash on Delivery", async () => {
      const confirmation = new OrderConfirmationPage(page)
      await confirmation.expectOrderConfirmed()
      await confirmation.expectEmail(customer.email)
      await confirmation.expectPaymentMethod(COD_PAYMENT_METHOD_NAME)
      await confirmation.expectItemInSummary(productTitle)
    })
  })
})
