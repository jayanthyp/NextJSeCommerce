import { model } from "@medusajs/framework/utils"

// Keyed by email rather than piggybacking on Cart/Order.metadata — queryable
// independent of any order, and the natural source of truth to sync to
// MailerLite from (see the marketing-consent.captured subscriber).
const MarketingConsent = model.define("marketing_consent", {
  id: model.id().primaryKey(),
  email: model.text().unique(),
  opted_in_at: model.dateTime(),
  source: model.text(), // e.g. "checkout"
  order_id: model.text().nullable(),
  mailerlite_synced_at: model.dateTime().nullable(),
})

export default MarketingConsent
