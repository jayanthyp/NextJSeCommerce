import type {
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http"
import { generateEntityId } from "@medusajs/framework/utils"
import { WISHLIST_MODULE } from "../../../../modules/wishlist"
import WishlistModuleService from "../../../../modules/wishlist/service"

// Get-or-create the current customer's share token (possession of the
// resulting token is the access control for the public
// /store/wishlists/shared/[token] route — no separate is_public flag).
export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Sign in to share your wishlist" })
    return
  }

  const service: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)

  const [existing] = await service.listWishlistShares({ customer_id: customerId })
  if (existing) {
    res.json({ share_token: existing.share_token })
    return
  }

  const share = await service.createWishlistShares({
    customer_id: customerId,
    // Just needs to be unique and hard to guess, not a real Medusa entity —
    // reusing generateEntityId's ULID generation is a convenient source of
    // one rather than pulling in a separate ID library for it.
    share_token: generateEntityId(undefined, "wshare"),
  })
  res.json({ share_token: share.share_token })
}
