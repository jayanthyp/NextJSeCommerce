import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { WISHLIST_MODULE } from "../../../../../modules/wishlist"
import WishlistModuleService from "../../../../../modules/wishlist/service"

// Public — no auth. Possession of the token IS the authorization, matching
// the "shareable link" requirement (no separate is_public flag to manage).
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)
  const { token } = req.params

  const [share] = await service.listWishlistShares({ share_token: token })
  if (!share) {
    res.status(404).json({ message: "Shared wishlist not found" })
    return
  }

  const items = await service.listWishlistItems({ customer_id: share.customer_id })
  res.json({ product_ids: items.map((i) => i.product_id) })
}
