import { decryptSecret, encryptSecret, maskSecret } from "../crypto"

describe("razorpay-config crypto", () => {
  const originalKey = process.env.RAZORPAY_CONFIG_ENCRYPTION_KEY

  beforeEach(() => {
    process.env.RAZORPAY_CONFIG_ENCRYPTION_KEY = "test-encryption-key-not-for-production"
  })

  afterEach(() => {
    process.env.RAZORPAY_CONFIG_ENCRYPTION_KEY = originalKey
  })

  it("round-trips a secret through encrypt/decrypt", () => {
    const plaintext = "rzp_live_super_secret_value_123"
    const encrypted = encryptSecret(plaintext)

    expect(encrypted).not.toBe(plaintext)
    expect(decryptSecret(encrypted)).toBe(plaintext)
  })

  it("produces a different ciphertext each time (random IV)", () => {
    const plaintext = "same-plaintext"
    const first = encryptSecret(plaintext)
    const second = encryptSecret(plaintext)

    expect(first).not.toBe(second)
    expect(decryptSecret(first)).toBe(plaintext)
    expect(decryptSecret(second)).toBe(plaintext)
  })

  it("fails to decrypt with the wrong key (tamper/key-mismatch detection)", () => {
    const encrypted = encryptSecret("sensitive-value")
    process.env.RAZORPAY_CONFIG_ENCRYPTION_KEY = "a-completely-different-key"

    expect(() => decryptSecret(encrypted)).toThrow()
  })

  it("throws if RAZORPAY_CONFIG_ENCRYPTION_KEY is unset", () => {
    delete process.env.RAZORPAY_CONFIG_ENCRYPTION_KEY
    expect(() => encryptSecret("value")).toThrow(/RAZORPAY_CONFIG_ENCRYPTION_KEY/)
  })

  it("masks a secret to only its last 4 characters", () => {
    expect(maskSecret("rzp_live_abcd1234")).toBe("••••••••1234")
  })
})
