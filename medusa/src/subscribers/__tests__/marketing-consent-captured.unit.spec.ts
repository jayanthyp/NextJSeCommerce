import marketingConsentCapturedHandler from "../marketing-consent-captured"

describe("marketing-consent-captured subscriber", () => {
  const originalFetch = global.fetch
  const originalApiKey = process.env.MAILERLITE_API_KEY

  afterEach(() => {
    global.fetch = originalFetch
    process.env.MAILERLITE_API_KEY = originalApiKey
  })

  it("no-ops when MAILERLITE_API_KEY is unset", async () => {
    delete process.env.MAILERLITE_API_KEY
    const fetchMock = jest.fn()
    global.fetch = fetchMock as any

    await marketingConsentCapturedHandler({
      event: { data: { id: "mc_1" } },
      container: { resolve: jest.fn() } as any,
    } as any)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("posts the subscriber payload to MailerLite and marks the record synced", async () => {
    process.env.MAILERLITE_API_KEY = "test-key"
    process.env.MAILERLITE_GROUP_ID = "group_123"

    const fetchMock = jest.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as any

    const consent = {
      id: "mc_1",
      email: "shopper@example.com",
      mailerlite_synced_at: null,
    }
    const updateMarketingConsents = jest.fn()
    const consentService = {
      retrieveMarketingConsent: jest.fn().mockResolvedValue(consent),
      updateMarketingConsents,
    }
    const logger = { info: jest.fn(), error: jest.fn() }
    const container = {
      resolve: jest.fn((key: string) =>
        key === "logger" ? logger : consentService
      ),
    }

    await marketingConsentCapturedHandler({
      event: { data: { id: "mc_1" } },
      container: container as any,
    } as any)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://connect.mailerlite.com/api/subscribers",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({ email: "shopper@example.com", groups: ["group_123"] })

    expect(updateMarketingConsents).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mc_1" })
    )
  })

  it("does not throw when MailerLite responds with an error", async () => {
    process.env.MAILERLITE_API_KEY = "test-key"
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 422 }) as any

    const consentService = {
      retrieveMarketingConsent: jest.fn().mockResolvedValue({
        id: "mc_1",
        email: "fails@example.com",
      }),
      updateMarketingConsents: jest.fn(),
    }
    const logger = { info: jest.fn(), error: jest.fn() }
    const container = {
      resolve: jest.fn((key: string) =>
        key === "logger" ? logger : consentService
      ),
    }

    await expect(
      marketingConsentCapturedHandler({
        event: { data: { id: "mc_1" } },
        container: container as any,
      } as any)
    ).resolves.not.toThrow()

    expect(consentService.updateMarketingConsents).not.toHaveBeenCalled()
  })
})
