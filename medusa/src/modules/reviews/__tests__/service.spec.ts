import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { REVIEWS_MODULE } from "../index"
import ReviewsModuleService from "../service"
import Review from "../models/review"

jest.setTimeout(60 * 1000)

moduleIntegrationTestRunner<ReviewsModuleService>({
  moduleName: REVIEWS_MODULE,
  moduleModels: [Review],
  resolve: "./src/modules/reviews",
  testSuite: ({ service }) => {
    describe("Reviews Module Service", () => {
      it("defaults a new review to pending status", async () => {
        const [review] = await service.createReviews([
          {
            product_id: "prod_1",
            customer_id: "cus_1",
            order_id: "order_1",
            rating: 5,
            content: "Great product",
          },
        ])

        expect(review.status).toEqual("pending")
      })

      it("filters reviews by product and status", async () => {
        await service.createReviews([
          {
            product_id: "prod_2",
            customer_id: "cus_1",
            order_id: "order_2",
            rating: 5,
            content: "Approved review",
            status: "approved",
          },
          {
            product_id: "prod_2",
            customer_id: "cus_2",
            order_id: "order_3",
            rating: 2,
            content: "Pending review",
            status: "pending",
          },
        ])

        const approved = await service.listReviews({
          product_id: "prod_2",
          status: "approved",
        })

        expect(approved).toHaveLength(1)
        expect(approved[0].content).toEqual("Approved review")
      })

      it("moderates a review by updating its status", async () => {
        const [review] = await service.createReviews([
          {
            product_id: "prod_3",
            customer_id: "cus_3",
            order_id: "order_4",
            rating: 4,
            content: "Pending until approved",
          },
        ])

        const updated = await service.updateReviews({
          id: review.id,
          status: "approved",
        })

        expect(updated.status).toEqual("approved")
      })
    })
  },
})
