import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(180 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api }) => {
    describe("Store wishlists", () => {
      const email = `wisher-${Date.now()}@example.com`
      const password = "supersecret123"
      const productId = "prod_wishlist_test"
      let sessionToken: string

      beforeAll(async () => {
        const { data: registerData } = await api.post(
          "/auth/customer/emailpass/register",
          { email, password }
        )

        await api.post(
          "/store/customers",
          { email, first_name: "Wish", last_name: "Lister" },
          { headers: { Authorization: `Bearer ${registerData.token}` } }
        )

        const { data: loginData } = await api.post(
          "/auth/customer/emailpass",
          { email, password }
        )
        sessionToken = loginData.token
      })

      it("rejects unauthenticated access to the wishlist", async () => {
        await expect(api.get("/store/wishlists")).rejects.toMatchObject({
          response: { status: 401 },
        })
        await expect(
          api.post("/store/wishlists", { product_id: productId })
        ).rejects.toMatchObject({ response: { status: 401 } })
      })

      it("adds, lists, and removes a wishlist item", async () => {
        const { data: addData } = await api.post(
          "/store/wishlists",
          { product_id: productId },
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        )
        expect(addData.wishlist_item.product_id).toEqual(productId)

        const { data: listData } = await api.get("/store/wishlists", {
          headers: { Authorization: `Bearer ${sessionToken}` },
        })
        expect(listData.wishlist_items).toHaveLength(1)

        await api.delete(`/store/wishlists/${addData.wishlist_item.id}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        })

        const { data: listAfterDeleteData } = await api.get(
          "/store/wishlists",
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        )
        expect(listAfterDeleteData.wishlist_items).toHaveLength(0)
      })

      it("creates a share token and exposes the wishlist publicly through it", async () => {
        await api.post(
          "/store/wishlists",
          { product_id: productId },
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        )

        const { data: shareData } = await api.get("/store/wishlists/share", {
          headers: { Authorization: `Bearer ${sessionToken}` },
        })
        expect(shareData.share_token).toBeTruthy()

        // Requesting a second time returns the same token (get-or-create).
        const { data: shareAgainData } = await api.get(
          "/store/wishlists/share",
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        )
        expect(shareAgainData.share_token).toEqual(shareData.share_token)

        const { data: sharedData } = await api.get(
          `/store/wishlists/shared/${shareData.share_token}`
        )
        expect(sharedData.product_ids).toContain(productId)
      })

      it("returns 404 for a bogus share token", async () => {
        await expect(
          api.get("/store/wishlists/shared/not-a-real-token")
        ).rejects.toMatchObject({ response: { status: 404 } })
      })
    })
  },
})
