import CodProviderService from "../service"

const makeService = () => {
  const logger = { info: jest.fn(), error: jest.fn() }
  return new (CodProviderService as any)({ logger }, {}) as CodProviderService
}

describe("CodProviderService", () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe("initiatePayment", () => {
    it("mints a local session id and preserves data without calling any gateway", async () => {
      const service = makeService()
      const result = await service.initiatePayment({
        amount: 900,
        currency_code: "inr",
        data: { cart_id: "cart_1" },
      } as any)

      expect(result.id).toEqual(expect.any(String))
      expect(result.data).toEqual({ cart_id: "cart_1" })
    })
  })

  describe("authorizePayment", () => {
    it("authorizes immediately so the order can be placed without capturing", async () => {
      const service = makeService()
      const result = await service.authorizePayment({ data: {} } as any)
      expect(result.status).toBe("authorized")
    })
  })

  describe("capturePayment", () => {
    it("passes data through for the merchant capture-on-delivery action", async () => {
      const service = makeService()
      const result = await service.capturePayment({ data: { id: "pay_1" } } as any)
      expect(result.data).toEqual({ id: "pay_1" })
    })
  })

  describe("getPaymentStatus", () => {
    it("reports authorized (awaiting collection) since there is no external status", async () => {
      const service = makeService()
      const result = await service.getPaymentStatus({ data: {} } as any)
      expect(result.status).toBe("authorized")
    })
  })

  describe("getWebhookActionAndData", () => {
    it("reports not_supported since COD has no gateway webhooks", async () => {
      const service = makeService()
      const result = await service.getWebhookActionAndData({ data: {} } as any)
      expect(result.action).toBe("not_supported")
    })
  })
})
