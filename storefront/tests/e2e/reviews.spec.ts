import { test, expect } from "@playwright/test"
import { ProductPage } from "./pages/product-page"
import { CartPage } from "./pages/cart-page"
import { CheckoutPage } from "./pages/checkout-page"
import { OrderConfirmationPage } from "./pages/order-confirmation-page"
import { AuthPage } from "./pages/auth-page"
import { ReviewsPage } from "./pages/reviews-page"
import {
  COUNTRY_CODE,
  PRODUCT_HANDLE,
  DELIVERY_METHOD_NAME,
  PAYMENT_METHOD_NAME,
  uniqueTestAccount,
} from "./fixtures/test-data"

/**
 * Reviews are gated on a verified purchase (payment_status "captured" on an
 * order containing the product — see src/api/store/reviews/route.ts), which
 * only happens for real once a checkout actually completes. So the "can
 * review" case here runs a genuine purchase first rather than seeding one,
 * unlike the backend integration test which seeds the order directly.
 */
test.describe("Reviews", () => {
  test("signed-out visitors see a sign-in prompt instead of the review form", async ({
    page,
  }) => {
    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

    const reviews = new ReviewsPage(page)
    await reviews.openReviewsTab()
    await reviews.expectSignInPrompt()
  })

  test("a signed-in customer without a qualifying order cannot submit a review", async ({
    page,
  }) => {
    const auth = new AuthPage(page)
    await auth.registerNewCustomer(COUNTRY_CODE, uniqueTestAccount())

    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

    const reviews = new ReviewsPage(page)
    await reviews.openReviewsTab()
    await reviews.submitReview({ rating: 5, content: "Never bought this" })

    await expect(page.getByText(/failed to submit review|own orders/i)).toBeVisible()
  })

  test("a customer who purchased the product can leave a review", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.registerNewCustomer(COUNTRY_CODE, uniqueTestAccount())

    const productPage = new ProductPage(page)
    await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)
    await productPage.selectFirstAvailableVariant()
    await productPage.addToCart()

    await test.step("Complete a real checkout while signed in", async () => {
      const cartPage = new CartPage(page)
      await cartPage.goto(COUNTRY_CODE)
      await cartPage.proceedToCheckout()

      const checkoutPage = new CheckoutPage(page)
      await checkoutPage.fillShippingAddress({
        firstName: "Ada",
        lastName: "Tester",
        address: "123 Test Street",
        postalCode: "2000",
        city: "Sydney",
        countryCode: COUNTRY_CODE,
        province: "New South Wales",
        email: `checkout-${Date.now()}@example.com`,
      })
      await checkoutPage.selectDeliveryMethod(DELIVERY_METHOD_NAME)
      await checkoutPage.continueToPayment()
      await checkoutPage.selectPaymentMethod(PAYMENT_METHOD_NAME)
      await checkoutPage.continueToReview()
      await checkoutPage.placeOrder()

      const confirmation = new OrderConfirmationPage(page)
      await confirmation.expectOrderConfirmed()
    })

    await test.step("Leave a review for the purchased product", async () => {
      await productPage.goto(COUNTRY_CODE, PRODUCT_HANDLE)

      const reviews = new ReviewsPage(page)
      await reviews.openReviewsTab()
      await reviews.submitReview({
        rating: 5,
        title: "Great fit",
        content: "Exactly as described, would buy again.",
      })
      await reviews.expectSubmissionConfirmed()
    })
  })
})
