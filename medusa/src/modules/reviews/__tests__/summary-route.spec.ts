import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { REVIEWS_MODULE } from "../index"
import ReviewsModuleService from "../service"
import Review from "../models/review"
import { GET } from "../../../api/store/reviews/summary/route"

jest.setTimeout(60 * 1000)

// Exercises the actual route handler (not a reimplementation of its logic)
// against a real service/DB via moduleIntegrationTestRunner, sidestepping
// the full HTTP/Express bootstrap medusaIntegrationTestRunner's inApp:true
// mode needs (this route has no auth/routing concerns of its own to
// verify — just query-param handling and aggregation — so the lighter
// module-level runner already used by service.spec.ts in this same
// directory is sufficient).
moduleIntegrationTestRunner<ReviewsModuleService>({
  moduleName: REVIEWS_MODULE,
  moduleModels: [Review],
  resolve: "./src/modules/reviews",
  testSuite: ({ service }) => {
    describe("GET /store/reviews/summary", () => {
      const makeReqRes = (productId: string | string[] | undefined) => {
        const req = {
          scope: { resolve: () => service },
          query: { product_id: productId },
        } as any
        const res = { json: jest.fn() } as any
        return { req, res }
      }

      it("returns an empty summary map when no product_id is given", async () => {
        const { req, res } = makeReqRes(undefined)

        await GET(req, res)

        expect(res.json).toHaveBeenCalledWith({ summaries: {} })
      })

      it("aggregates approved-only average + count per product, across multiple ids in one call", async () => {
        await service.createReviews([
          {
            product_id: "prod_route_a",
            customer_id: "cus_1",
            order_id: "order_1",
            rating: 5,
            content: "Great",
            status: "approved",
          },
          {
            product_id: "prod_route_a",
            customer_id: "cus_2",
            order_id: "order_2",
            rating: 3,
            content: "Fine",
            status: "approved",
          },
          {
            product_id: "prod_route_a",
            customer_id: "cus_3",
            order_id: "order_3",
            rating: 1,
            content: "Not yet moderated",
            status: "pending",
          },
          {
            product_id: "prod_route_b",
            customer_id: "cus_4",
            order_id: "order_4",
            rating: 4,
            content: "Good",
            status: "approved",
          },
        ])

        const { req, res } = makeReqRes(["prod_route_a", "prod_route_b"])

        await GET(req, res)

        expect(res.json).toHaveBeenCalledWith({
          summaries: {
            prod_route_a: { average: 4, count: 2 },
            prod_route_b: { average: 4, count: 1 },
          },
        })
      })

      it("accepts a single product_id as a plain string, not just an array", async () => {
        await service.createReviews([
          {
            product_id: "prod_route_c",
            customer_id: "cus_5",
            order_id: "order_5",
            rating: 2,
            content: "Meh",
            status: "approved",
          },
        ])

        const { req, res } = makeReqRes("prod_route_c")

        await GET(req, res)

        expect(res.json).toHaveBeenCalledWith({
          summaries: { prod_route_c: { average: 2, count: 1 } },
        })
      })
    })
  },
})
