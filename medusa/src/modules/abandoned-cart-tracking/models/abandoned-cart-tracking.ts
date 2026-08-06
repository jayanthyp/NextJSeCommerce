import { model } from "@medusajs/framework/utils"

// One row per cart that has ever qualified as idle, tracking which reminder
// tiers have already been sent so the job stays idempotent across runs.
// Lives on its own module rather than on Cart directly — reminder state
// isn't something the Cart module should own.
const AbandonedCartTracking = model.define("abandoned_cart_tracking", {
  id: model.id().primaryKey(),
  cart_id: model.text().unique(),
  reminder_1h_sent_at: model.dateTime().nullable(),
  reminder_24h_sent_at: model.dateTime().nullable(),
  reminder_3d_sent_at: model.dateTime().nullable(),
})

export default AbandonedCartTracking
