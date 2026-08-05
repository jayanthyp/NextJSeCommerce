import type {
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http"
import { WISHLIST_MODULE } from "../../../../modules/wishlist"
import WishlistModuleService from "../../../../modules/wishlist/service"

export async function DELETE(req: MedusaStoreRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Sign in to use your wishlist" })
    return
  }

  const service: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)
  const { itemId } = req.params

  // Ownership check — a customer can only delete their own wishlist items.
  const item = await service.retrieveWishlistItem(itemId).catch(() => null)
  if (!item || item.customer_id !== customerId) {
    res.status(404).json({ message: "Wishlist item not found" })
    return
  }

  await service.deleteWishlistItems(itemId)
  res.json({ id: itemId, object: "wishlist_item", deleted: true })
}
