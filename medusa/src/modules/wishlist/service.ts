import { MedusaService } from "@medusajs/framework/utils"
import WishlistItem from "./models/wishlist-item"
import WishlistShare from "./models/wishlist-share"

class WishlistModuleService extends MedusaService({
  WishlistItem,
  WishlistShare,
}) {}

export default WishlistModuleService
