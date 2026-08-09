import crypto from "crypto"
import RazorpayProviderService from "../service"

const KEY_ID = "rzp_test_key"
const KEY_SECRET = "test_key_secret"
const WEBHOOK_SECRET = "test_webhook_secret"

const makeService = () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  return new (RazorpayProviderService as any)(
    { logger },
    { keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET }
  ) as RazorpayProviderService
}

const signOrderPayment = (orderId: string, paymentId: string) =>
  crypto
    .createHmac("sha256", KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex")

const signWebhookBody = (rawBody: string) =>
  crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex")

describe("RazorpayProviderService", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  describe("initiatePayment", () => {
    it("creates a Razorpay order with the amount converted to paise and auto-capture on", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "order_abc123", status: "created" }),
      })
      global.fetch = fetchMock as any

      const service = makeService()
      const result = await service.initiatePayment({
        amount: 1350,
        currency_code: "inr",
      } as any)

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.razorpay.com/v1/orders",
        expect.objectContaining({ method: "POST" })
      )
      const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body)
      expect(body).toEqual({
        amount: 135000,
        currency: "INR",
        payment_capture: 1,
      })
      expect(result).toEqual({
        id: "order_abc123",
        data: { id: "order_abc123", status: "created" },
      })
    })
  })

  describe("authorizePayment", () => {
    it("returns pending_authorization when the customer hasn't completed Checkout yet", async () => {
      const service = makeService()
      const result = await service.authorizePayment({
        data: { id: "order_abc123" },
      } as any)

      expect(result).toEqual({
        status: "pending_authorization",
        data: { id: "order_abc123" },
      })
    })

    it("authorizes when the payment signature is valid", async () => {
      const service = makeService()
      const signature = signOrderPayment("order_abc123", "pay_xyz789")

      const result = await service.authorizePayment({
        data: {
          id: "order_abc123",
          razorpay_payment_id: "pay_xyz789",
          razorpay_signature: signature,
        },
      } as any)

      expect(result.status).toBe("authorized")
      expect(result.data).toMatchObject({ razorpay_payment_id: "pay_xyz789" })
    })

    it("throws when the payment signature is invalid", async () => {
      const service = makeService()

      await expect(
        service.authorizePayment({
          data: {
            id: "order_abc123",
            razorpay_payment_id: "pay_xyz789",
            razorpay_signature: "not-the-real-signature",
          },
        } as any)
      ).rejects.toThrow(/signature verification failed/i)
    })
  })

  describe("getWebhookActionAndData", () => {
    const buildPayload = (event: string, paymentEntity: Record<string, unknown>) => {
      const data = { event, payload: { payment: { entity: paymentEntity } } }
      const rawData = JSON.stringify(data)
      return { data, rawData }
    }

    it("returns a captured action for a validly-signed payment.captured event", async () => {
      const service = makeService()
      const { data, rawData } = buildPayload("payment.captured", {
        order_id: "order_abc123",
        amount: 135000,
      })
      const signature = signWebhookBody(rawData)

      const result = await service.getWebhookActionAndData({
        data,
        rawData,
        headers: { "x-razorpay-signature": signature },
      } as any)

      expect(result.action).toBe("captured")
      expect(result.data?.session_id).toBe("order_abc123")
      expect((result.data?.amount as any).numeric).toBe(1350)
    })

    it("returns a failed action for a validly-signed payment.failed event", async () => {
      const service = makeService()
      const { data, rawData } = buildPayload("payment.failed", {
        order_id: "order_abc123",
        amount: 135000,
      })
      const signature = signWebhookBody(rawData)

      const result = await service.getWebhookActionAndData({
        data,
        rawData,
        headers: { "x-razorpay-signature": signature },
      } as any)

      expect(result.action).toBe("failed")
    })

    it("returns not_supported for an event type it doesn't handle", async () => {
      const service = makeService()
      const { data, rawData } = buildPayload("order.paid", {
        order_id: "order_abc123",
      })
      const signature = signWebhookBody(rawData)

      const result = await service.getWebhookActionAndData({
        data,
        rawData,
        headers: { "x-razorpay-signature": signature },
      } as any)

      expect(result.action).toBe("not_supported")
    })

    it("throws when the webhook signature is missing or invalid", async () => {
      const service = makeService()
      const { data, rawData } = buildPayload("payment.captured", {
        order_id: "order_abc123",
        amount: 135000,
      })

      await expect(
        service.getWebhookActionAndData({
          data,
          rawData,
          headers: { "x-razorpay-signature": "wrong" },
        } as any)
      ).rejects.toThrow(/signature verification failed/i)

      await expect(
        service.getWebhookActionAndData({ data, rawData, headers: {} } as any)
      ).rejects.toThrow(/signature verification failed/i)
    })
  })
})
