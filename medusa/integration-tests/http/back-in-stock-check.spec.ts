import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import backInStockCheckJob from "../../src/jobs/back-in-stock-check"
import { BACK_IN_STOCK_REQUEST_MODULE } from "../../src/modules/back-in-stock-request"
import BackInStockRequestModuleService from "../../src/modules/back-in-stock-request/service"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ getContainer, api }) => {
    describe("back-in-stock-check job", () => {
      it("notifies and marks a request once its variant has stock", async () => {
        const container = getContainer()

        const email = `restock-${Date.now()}@example.com`
        const password = "supersecret123"
        const { data: registerData } = await api.post(
          "/auth/customer/emailpass/register",
          { email, password }
        )
        const { data: customerData } = await api.post(
          "/store/customers",
          { email, first_name: "Restock", last_name: "Tester" },
          { headers: { Authorization: `Bearer ${registerData.token}` } }
        )
        const customerId = customerData.customer.id

        // A product/variant not managed by inventory is always "in stock" —
        // avoids needing to seed real inventory levels/locations just to
        // exercise the job's request -> notify -> mark-notified path.
        const productModuleService = container.resolve("product")
        const [product] = await productModuleService.createProducts([
          {
            title: "Restock Test Product",
            status: "published",
            options: [{ title: "Size", values: ["One size"] }],
            variants: [
              {
                title: "One size",
                manage_inventory: false,
                options: { Size: "One size" },
              },
            ],
          },
        ])
        const variantId = product.variants[0].id

        const requestService: BackInStockRequestModuleService =
          container.resolve(BACK_IN_STOCK_REQUEST_MODULE)
        const [request] = await requestService.createBackInStockRequests([
          { customer_id: customerId, variant_id: variantId, product_id: product.id },
        ])

        await backInStockCheckJob(container)

        const updated = await requestService.retrieveBackInStockRequest(request.id)
        expect(updated.notified_at).toBeTruthy()
      })

      it("does nothing when there are no pending requests", async () => {
        const container = getContainer()
        // Just asserting it doesn't throw with an empty queue.
        await expect(backInStockCheckJob(container)).resolves.not.toThrow()
      })
    })
  },
})
