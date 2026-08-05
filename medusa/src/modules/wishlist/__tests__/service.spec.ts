import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { WISHLIST_MODULE } from "../index"
import WishlistModuleService from "../service"
import WishlistItem from "../models/wishlist-item"
import WishlistShare from "../models/wishlist-share"

jest.setTimeout(60 * 1000)

moduleIntegrationTestRunner<WishlistModuleService>({
  moduleName: WISHLIST_MODULE,
  moduleModels: [WishlistItem, WishlistShare],
  resolve: "./src/modules/wishlist",
  testSuite: ({ service }) => {
    describe("Wishlist Module Service", () => {
      it("adds and lists wishlist items for a customer", async () => {
        await service.createWishlistItems([
          { customer_id: "cus_1", product_id: "prod_1" },
        ])

        const items = await service.listWishlistItems({ customer_id: "cus_1" })

        expect(items).toHaveLength(1)
        expect(items[0].product_id).toEqual("prod_1")
      })

      it("removes a wishlist item", async () => {
        const [item] = await service.createWishlistItems([
          { customer_id: "cus_2", product_id: "prod_2" },
        ])

        await service.deleteWishlistItems([item.id])

        const items = await service.listWishlistItems({ customer_id: "cus_2" })
        expect(items).toHaveLength(0)
      })

      it("scopes wishlist items per customer", async () => {
        await service.createWishlistItems([
          { customer_id: "cus_3", product_id: "prod_3" },
          { customer_id: "cus_4", product_id: "prod_3" },
        ])

        const items = await service.listWishlistItems({ customer_id: "cus_3" })
        expect(items).toHaveLength(1)
      })

      it("creates a share token and looks it up by customer", async () => {
        const [share] = await service.createWishlistShares([
          { customer_id: "cus_5", share_token: "tok_abc" },
        ])

        expect(share.share_token).toEqual("tok_abc")

        const shares = await service.listWishlistShares({ customer_id: "cus_5" })
        expect(shares).toHaveLength(1)
        expect(shares[0].share_token).toEqual("tok_abc")
      })
    })
  },
})
