import { model } from "@medusajs/framework/utils"

// One share token per customer, created on first share request. Kept as its
// own independent model rather than a formal relation to WishlistItem —
// both are just filtered/looked-up by customer_id, no join needed.
const WishlistShare = model.define("wishlist_share", {
  id: model.id().primaryKey(),
  customer_id: model.text().unique(),
  share_token: model.text().unique(),
})

export default WishlistShare
