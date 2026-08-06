import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { BACK_IN_STOCK_REQUEST_MODULE } from "../index"
import BackInStockRequestModuleService from "../service"
import BackInStockRequest from "../models/back-in-stock-request"

jest.setTimeout(60 * 1000)

moduleIntegrationTestRunner<BackInStockRequestModuleService>({
  moduleName: BACK_IN_STOCK_REQUEST_MODULE,
  moduleModels: [BackInStockRequest],
  resolve: "./src/modules/back-in-stock-request",
  testSuite: ({ service }) => {
    describe("Back In Stock Request Module Service", () => {
      it("creates a request defaulting to un-notified", async () => {
        const [request] = await service.createBackInStockRequests([
          { customer_id: "cus_1", variant_id: "variant_1", product_id: "prod_1" },
        ])

        expect(request.notified_at).toBeFalsy()
      })

      it("lists pending (un-notified) requests", async () => {
        await service.createBackInStockRequests([
          { customer_id: "cus_2", variant_id: "variant_2", product_id: "prod_2" },
        ])
        const [notified] = await service.createBackInStockRequests([
          { customer_id: "cus_3", variant_id: "variant_3", product_id: "prod_3" },
        ])
        await service.updateBackInStockRequests({
          id: notified.id,
          notified_at: new Date(),
        })

        const pending = await service.listBackInStockRequests({
          notified_at: null,
        })
        expect(pending.map((r) => r.customer_id)).toContain("cus_2")
        expect(pending.map((r) => r.customer_id)).not.toContain("cus_3")
      })

      it("scopes requests per customer", async () => {
        await service.createBackInStockRequests([
          { customer_id: "cus_4", variant_id: "variant_4", product_id: "prod_4" },
        ])
        const requests = await service.listBackInStockRequests({
          customer_id: "cus_4",
        })
        expect(requests).toHaveLength(1)
      })
    })
  },
})
