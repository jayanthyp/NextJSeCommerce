import { model } from "@medusajs/framework/utils"

// One wishlist per customer (v1 — no multi-named-wishlist UI requested),
// so each row is just a (customer, product) pairing rather than needing a
// separate parent "wishlist" entity to belong to.
const WishlistItem = model.define("wishlist_item", {
  id: model.id().primaryKey(),
  customer_id: model.text(),
  product_id: model.text(),
})

export default WishlistItem
