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
 * Full purchase journey against a live backend: browse -> add to cart ->
 * checkout (address, delivery, payment) -> place order -> confirmation.
 *
 * Prerequisites (see storefront/tests/e2e/README.md):
 *   - The full stack is up: `docker compose -f docker-compose.yml
 *     -f docker-compose.local.yml up -d` from the repo root.
 *   - The backend has been seeded, so the product/region fixtures in
 *     ./fixtures/test-data.ts actually exist.
 *
 * This exercises real Server Actions against the real Medusa backend (no
 * mocking) — it's the same path that caught three production bugs during
 * manual testing: a product page that 500'd on every load, the same crash
 * on category/collection pages, and a broken admin session cookie. Kept as
 * one linear test rather than split into independent cases because each
 * checkout step genuinely depends on the cart/session state the previous
 * step produced — that dependency is exactly what an E2E test should prove
 * holds end to end.
 */
test.describe("Order journey", () => {
  test("customer can browse, check out, and receive an order confirmation", async ({
    page,
  }) => {
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

    await test.step("Fill shipping address", async () => {
      await checkoutPage.fillShippingAddress(customer)
      await checkoutPage.continueToDelivery()
    })

    await test.step("Select delivery method", async () => {
      await checkoutPage.selectDeliveryMethod(DELIVERY_METHOD_NAME)
      await checkoutPage.continueToPayment()
    })

    await test.step("Select payment method", async () => {
      await checkoutPage.selectPaymentMethod(PAYMENT_METHOD_NAME)
      await checkoutPage.continueToReview()
    })

    await test.step("Place the order", async () => {
      await checkoutPage.placeOrder()
    })

    await test.step("Order confirmation shows the right order", async () => {
      const confirmation = new OrderConfirmationPage(page)
      await confirmation.expectOrderConfirmed()
      await confirmation.expectEmail(customer.email)
      await confirmation.expectPaymentMethod(PAYMENT_METHOD_NAME)
      await confirmation.expectItemInSummary(productTitle)

      const orderId = await confirmation.getOrderId()
      expect(orderId).toMatch(/^\d+$/)
    })
  })
})
