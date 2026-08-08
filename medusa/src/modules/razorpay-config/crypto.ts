import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"

/**
 * AES-256-GCM key derived from RAZORPAY_CONFIG_ENCRYPTION_KEY -- hashed
 * rather than used raw so the env var can be any string, not required to be
 * exactly 32 bytes of hex.
 */
function getKey(): Buffer {
  const secret = process.env.RAZORPAY_CONFIG_ENCRYPTION_KEY
  if (!secret) {
    throw new Error(
      "RAZORPAY_CONFIG_ENCRYPTION_KEY is not set -- cannot encrypt/decrypt stored Razorpay credentials."
    )
  }
  return crypto.createHash("sha256").update(secret).digest()
}

/** Returns `iv:authTag:ciphertext`, all hex-encoded, as a single string column value. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":")
}

export function decryptSecret(payload: string): string {
  const [ivHex, authTagHex, dataHex] = payload.split(":")
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("Malformed encrypted Razorpay credential payload.")
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"))
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ])
  return decrypted.toString("utf8")
}

/** Last 4 characters only -- enough for an admin to recognize which secret is set, never the full value. */
export function maskSecret(plaintext: string): string {
  const tail = plaintext.slice(-4)
  return `${"•".repeat(8)}${tail}`
}
