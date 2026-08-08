import { model } from "@medusajs/framework/utils"

// Singleton table -- the service always operates on the single row (see
// service.ts's getOrCreateSingleton), so there's no need for a lookup key
// beyond the generated id. key_secret/webhook_secret columns store
// encrypted payloads (crypto.ts's encryptSecret output), never plaintext.
// key_id is Razorpay's publishable-style identifier (used client-side in
// Checkout.js) so it isn't encrypted, matching how it's already handled in
// the env-var-based config this replaces.
const RazorpayConfig = model.define("razorpay_config", {
  id: model.id().primaryKey(),
  active_mode: model.text().default("test"), // "test" | "live"
  test_key_id: model.text().nullable(),
  test_key_secret_encrypted: model.text().nullable(),
  test_webhook_secret_encrypted: model.text().nullable(),
  live_key_id: model.text().nullable(),
  live_key_secret_encrypted: model.text().nullable(),
  live_webhook_secret_encrypted: model.text().nullable(),
})

export default RazorpayConfig
