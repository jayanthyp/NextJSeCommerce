import { model } from "@medusajs/framework/utils"

// No DB-level compound unique constraint on (customer_id, variant_id) — same
// pragmatic choice as the wishlist module: dedup is enforced in the POST
// route with a pre-check rather than depending on unverified compound-index
// DML syntax.
const BackInStockRequest = model.define("back_in_stock_request", {
  id: model.id().primaryKey(),
  customer_id: model.text(),
  variant_id: model.text(),
  product_id: model.text(),
  notified_at: model.dateTime().nullable(),
})

export default BackInStockRequest
