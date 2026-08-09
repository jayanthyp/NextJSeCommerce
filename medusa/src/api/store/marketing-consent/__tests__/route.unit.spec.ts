import { Modules } from "@medusajs/framework/utils"
import { POST } from "../route"

const makeRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

describe("POST /store/marketing-consent", () => {
  it("rejects a missing email", async () => {
    const req: any = { body: {}, scope: { resolve: jest.fn() } }
    const res = makeRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("rejects a malformed email", async () => {
    const req: any = { body: { email: "not-an-email" }, scope: { resolve: jest.fn() } }
    const res = makeRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("creates a new consent record, emits the captured event, and reports not-already-subscribed", async () => {
    const emit = jest.fn()
    const service = {
      listMarketingConsents: jest.fn().mockResolvedValue([]),
      createMarketingConsents: jest
        .fn()
        .mockResolvedValue({ id: "mc_1", email: "new@example.com" }),
    }
    const req: any = {
      body: { email: "new@example.com", source: "footer_newsletter" },
      scope: {
        resolve: jest.fn((key: string) =>
          key === Modules.EVENT_BUS ? { emit } : service
        ),
      },
    }
    const res = makeRes()

    await POST(req, res)

    expect(service.createMarketingConsents).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        source: "footer_newsletter",
      })
    )
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "marketing-consent.captured" })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ already_subscribed: false })
    )
  })

  it("does not duplicate or re-emit for an already-subscribed email", async () => {
    const emit = jest.fn()
    const service = {
      listMarketingConsents: jest
        .fn()
        .mockResolvedValue([{ id: "mc_1", email: "existing@example.com" }]),
      createMarketingConsents: jest.fn(),
    }
    const req: any = {
      body: { email: "existing@example.com" },
      scope: {
        resolve: jest.fn((key: string) =>
          key === Modules.EVENT_BUS ? { emit } : service
        ),
      },
    }
    const res = makeRes()

    await POST(req, res)

    expect(service.createMarketingConsents).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ already_subscribed: true })
    )
  })

  it("defaults source to checkout when unspecified", async () => {
    const service = {
      listMarketingConsents: jest.fn().mockResolvedValue([]),
      createMarketingConsents: jest
        .fn()
        .mockResolvedValue({ id: "mc_1", email: "checkout@example.com" }),
    }
    const req: any = {
      body: { email: "checkout@example.com" },
      scope: {
        resolve: jest.fn((key: string) =>
          key === Modules.EVENT_BUS ? { emit: jest.fn() } : service
        ),
      },
    }
    const res = makeRes()

    await POST(req, res)

    expect(service.createMarketingConsents).toHaveBeenCalledWith(
      expect.objectContaining({ source: "checkout" })
    )
  })
})
