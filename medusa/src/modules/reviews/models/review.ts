import { model } from "@medusajs/framework/utils"

const Review = model.define("review", {
  id: model.id().primaryKey(),
  product_id: model.text(),
  customer_id: model.text(),
  order_id: model.text(),
  // Denormalized so the storefront/admin can display a name without a
  // cross-module join back to the customer module for every review.
  customer_name: model.text().nullable(),
  rating: model.number(),
  title: model.text().nullable(),
  content: model.text(),
  status: model.text().default("pending"), // pending | approved | rejected
})

export default Review
