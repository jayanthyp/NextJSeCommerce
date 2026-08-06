import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api }) => {
    describe("Store back-in-stock requests", () => {
      const email = `notify-me-${Date.now()}@example.com`
      const password = "supersecret123"
      const productId = "prod_notify_test"
      const variantId = "variant_notify_test"
      let sessionToken: string

      beforeAll(async () => {
        const { data: registerData } = await api.post(
          "/auth/customer/emailpass/register",
          { email, password }
        )

        await api.post(
          "/store/customers",
          { email, first_name: "Notify", last_name: "Me" },
          { headers: { Authorization: `Bearer ${registerData.token}` } }
        )

        const { data: loginData } = await api.post(
          "/auth/customer/emailpass",
          { email, password }
        )
        sessionToken = loginData.token
      })

      it("rejects unauthenticated access", async () => {
        await expect(
          api.post("/store/back-in-stock-requests", {
            variant_id: variantId,
            product_id: productId,
          })
        ).rejects.toMatchObject({ response: { status: 401 } })
      })

      it("creates, dedupes, lists, and removes a request", async () => {
        const { data: firstData } = await api.post(
          "/store/back-in-stock-requests",
          { variant_id: variantId, product_id: productId },
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        )
        expect(firstData.back_in_stock_request.variant_id).toEqual(variantId)

        // Posting again for the same variant should return the existing
        // request rather than creating a duplicate.
        const { data: secondData } = await api.post(
          "/store/back-in-stock-requests",
          { variant_id: variantId, product_id: productId },
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        )
        expect(secondData.back_in_stock_request.id).toEqual(
          firstData.back_in_stock_request.id
        )

        const { data: listData } = await api.get(
          "/store/back-in-stock-requests",
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        )
        expect(listData.back_in_stock_requests).toHaveLength(1)

        await api.delete(
          `/store/back-in-stock-requests/${firstData.back_in_stock_request.id}`,
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        )

        const { data: listAfterDeleteData } = await api.get(
          "/store/back-in-stock-requests",
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        )
        expect(listAfterDeleteData.back_in_stock_requests).toHaveLength(0)
      })
    })
  },
})
