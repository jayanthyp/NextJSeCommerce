import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { REVIEWS_MODULE } from "../../src/modules/reviews"
import ReviewsModuleService from "../../src/modules/reviews/service"

jest.setTimeout(180 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("Store reviews", () => {
      const email = `reviewer-${Date.now()}@example.com`
      const password = "supersecret123"
      const productId = "prod_review_test"
      let customerId: string
      let sessionToken: string

      beforeAll(async () => {
        const { data: registerData } = await api.post(
          "/auth/customer/emailpass/register",
          { email, password }
        )

        const { data: customerData } = await api.post(
          "/store/customers",
          { email, first_name: "Review", last_name: "Tester" },
          { headers: { Authorization: `Bearer ${registerData.token}` } }
        )
        customerId = customerData.customer.id

        const { data: loginData } = await api.post(
          "/auth/customer/emailpass",
          { email, password }
        )
        sessionToken = loginData.token
      })

      it("rejects an unauthenticated review submission", async () => {
        await expect(
          api.post("/store/reviews", {
            product_id: productId,
            rating: 5,
            content: "Should be rejected",
          })
        ).rejects.toMatchObject({ response: { status: 401 } })
      })

      it("rejects a review from a customer with no qualifying order", async () => {
        await expect(
          api.post(
            "/store/reviews",
            { product_id: productId, rating: 5, content: "No order for this" },
            { headers: { Authorization: `Bearer ${sessionToken}` } }
          )
        ).rejects.toMatchObject({ response: { status: 403 } })
      })

      it("accepts a review once the customer has an order for the product, and hides it until an admin approves it", async () => {
        const orderModuleService = getContainer().resolve(Modules.ORDER)
        // The review route's verified-purchase check just requires a
        // non-canceled, non-draft order containing the product (see
        // src/api/store/reviews/route.ts) — this project's only payment
        // provider (Manual Payment) never auto-captures and order.status
        // never auto-flips to "completed", so a real customer checkout
        // never reaches either of those states.
        await orderModuleService.createOrders([
          {
            customer_id: customerId,
            email,
            currency_code: "usd",
            items: [
              {
                title: "Reviewed product",
                quantity: 1,
                unit_price: 1000,
                product_id: productId,
              },
            ],
          },
        ])

        const { data: postData, status } = await api.post(
          "/store/reviews",
          { product_id: productId, rating: 5, content: "Loved it" },
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        )

        expect(status).toEqual(200)
        expect(postData.review.status).toEqual("pending")

        const { data: pendingListData } = await api.get(
          `/store/reviews?product_id=${productId}`
        )
        expect(pendingListData.reviews).toHaveLength(0)

        // Moderation lives behind admin auth, which this suite doesn't
        // bootstrap; flip the status directly via the module service instead
        // and assert the effect that actually matters: storefront visibility.
        const reviewsService: ReviewsModuleService =
          getContainer().resolve(REVIEWS_MODULE)
        await reviewsService.updateReviews({
          id: postData.review.id,
          status: "approved",
        })

        const { data: approvedListData } = await api.get(
          `/store/reviews?product_id=${productId}`
        )
        expect(approvedListData.reviews).toHaveLength(1)
        expect(approvedListData.reviews[0].id).toEqual(postData.review.id)
      })
    })
  },
})
