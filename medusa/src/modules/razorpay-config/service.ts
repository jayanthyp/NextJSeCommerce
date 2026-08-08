import { MedusaService } from "@medusajs/framework/utils"
import RazorpayConfig from "./models/razorpay-config"
import { decryptSecret, encryptSecret, maskSecret } from "./crypto"

type CredentialSet = {
  keyId: string
  keySecret: string
  webhookSecret: string
}

type MaskedCredentialSet = {
  key_id: string | null
  key_secret_masked: string | null
  webhook_secret_masked: string | null
  configured: boolean
}

type UpdateConfigInput = {
  active_mode?: "test" | "live"
  test?: { keyId?: string; keySecret?: string; webhookSecret?: string }
  live?: { keyId?: string; keySecret?: string; webhookSecret?: string }
}

class RazorpayConfigModuleService extends MedusaService({
  RazorpayConfig,
}) {
  /** There's exactly one config row -- create it on first access rather than requiring a seed step. */
  private async getOrCreateSingleton() {
    const [existing] = await this.listRazorpayConfigs({})
    if (existing) {
      return existing
    }
    return await this.createRazorpayConfigs({ active_mode: "test" })
  }

  async getMaskedConfig(): Promise<{
    active_mode: string
    test: MaskedCredentialSet
    live: MaskedCredentialSet
  }> {
    const config = await this.getOrCreateSingleton()

    const mask = (
      keyId: string | null,
      keySecretEncrypted: string | null,
      webhookSecretEncrypted: string | null
    ): MaskedCredentialSet => ({
      key_id: keyId,
      key_secret_masked: keySecretEncrypted ? maskSecret(decryptSecret(keySecretEncrypted)) : null,
      webhook_secret_masked: webhookSecretEncrypted
        ? maskSecret(decryptSecret(webhookSecretEncrypted))
        : null,
      configured: !!(keyId && keySecretEncrypted && webhookSecretEncrypted),
    })

    return {
      active_mode: config.active_mode,
      test: mask(config.test_key_id, config.test_key_secret_encrypted, config.test_webhook_secret_encrypted),
      live: mask(config.live_key_id, config.live_key_secret_encrypted, config.live_webhook_secret_encrypted),
    }
  }

  /**
   * Partial update -- only the fields actually provided are touched, so
   * e.g. flipping active_mode doesn't require resubmitting secrets, and
   * updating one mode's credentials doesn't disturb the other's.
   */
  async updateConfig(input: UpdateConfigInput) {
    const config = await this.getOrCreateSingleton()
    const update: Record<string, unknown> = {}

    if (input.active_mode) {
      update.active_mode = input.active_mode
    }
    if (input.test?.keyId !== undefined) {
      update.test_key_id = input.test.keyId
    }
    if (input.test?.keySecret !== undefined) {
      update.test_key_secret_encrypted = input.test.keySecret
        ? encryptSecret(input.test.keySecret)
        : null
    }
    if (input.test?.webhookSecret !== undefined) {
      update.test_webhook_secret_encrypted = input.test.webhookSecret
        ? encryptSecret(input.test.webhookSecret)
        : null
    }
    if (input.live?.keyId !== undefined) {
      update.live_key_id = input.live.keyId
    }
    if (input.live?.keySecret !== undefined) {
      update.live_key_secret_encrypted = input.live.keySecret
        ? encryptSecret(input.live.keySecret)
        : null
    }
    if (input.live?.webhookSecret !== undefined) {
      update.live_webhook_secret_encrypted = input.live.webhookSecret
        ? encryptSecret(input.live.webhookSecret)
        : null
    }

    await this.updateRazorpayConfigs({ selector: { id: config.id }, data: update })
  }

  /**
   * Decrypted credentials for whichever mode is currently active -- this is
   * what the Razorpay payment provider (see ../razorpay/service.ts) calls
   * at request time, so switching modes here takes effect immediately with
   * no redeploy. Returns null if that mode isn't fully configured yet, so
   * the caller can fall back to its static medusa-config.ts options.
   */
  async getActiveCredentials(): Promise<CredentialSet | null> {
    const config = await this.getOrCreateSingleton()
    const mode = config.active_mode === "live" ? "live" : "test"

    const keyId = mode === "live" ? config.live_key_id : config.test_key_id
    const keySecretEncrypted =
      mode === "live" ? config.live_key_secret_encrypted : config.test_key_secret_encrypted
    const webhookSecretEncrypted =
      mode === "live" ? config.live_webhook_secret_encrypted : config.test_webhook_secret_encrypted

    if (!keyId || !keySecretEncrypted || !webhookSecretEncrypted) {
      return null
    }

    return {
      keyId,
      keySecret: decryptSecret(keySecretEncrypted),
      webhookSecret: decryptSecret(webhookSecretEncrypted),
    }
  }
}

export default RazorpayConfigModuleService
