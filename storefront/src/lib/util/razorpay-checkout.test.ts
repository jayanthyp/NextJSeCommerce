import { afterEach, describe, expect, it, vi } from "vitest"
import { openRazorpayCheckout } from "./razorpay-checkout"

const VALID_SESSION_DATA = {
  id: "order_abc123",
  key_id: "rzp_test_key",
  amount: 135000,
  currency: "INR",
}

describe("openRazorpayCheckout", () => {
  afterEach(() => {
    delete (window as any).Razorpay
    vi.restoreAllMocks()
  })

  it("rejects without opening a modal when required session data is missing", async () => {
    await expect(
      openRazorpayCheckout({ id: "order_abc123" }, {})
    ).rejects.toThrow(/missing required data/i)
  })

  it("resolves with the handler's response on successful payment", async () => {
    let capturedOptions: any
    const open = vi.fn()
    ;(window as any).Razorpay = vi.fn().mockImplementation((options: any) => {
      capturedOptions = options
      return { open, on: vi.fn() }
    })

    const promise = openRazorpayCheckout(VALID_SESSION_DATA, {
      name: "Ada Tester",
      email: "ada@example.com",
      phone: "1234567890",
    })

    // openRazorpayCheckout awaits loadRazorpayScript() before constructing
    // Razorpay, so `new Razorpay(...)` only runs after a microtask tick.
    await vi.waitFor(() => expect(capturedOptions).toBeDefined())

    // Simulate Checkout.js calling the success handler.
    capturedOptions.handler({
      razorpay_payment_id: "pay_xyz789",
      razorpay_order_id: "order_abc123",
      razorpay_signature: "deadbeef",
    })

    await expect(promise).resolves.toEqual({
      razorpay_payment_id: "pay_xyz789",
      razorpay_order_id: "order_abc123",
      razorpay_signature: "deadbeef",
    })
    expect(open).toHaveBeenCalled()
    expect(capturedOptions.key).toBe("rzp_test_key")
    expect(capturedOptions.order_id).toBe("order_abc123")
    expect(capturedOptions.prefill).toEqual({
      name: "Ada Tester",
      email: "ada@example.com",
      contact: "1234567890",
    })
  })

  it("rejects when the customer dismisses the modal without paying", async () => {
    let capturedOptions: any
    ;(window as any).Razorpay = vi.fn().mockImplementation((options: any) => {
      capturedOptions = options
      return { open: vi.fn(), on: vi.fn() }
    })

    const promise = openRazorpayCheckout(VALID_SESSION_DATA, {})
    await vi.waitFor(() => expect(capturedOptions).toBeDefined())
    capturedOptions.modal.ondismiss()

    await expect(promise).rejects.toThrow(/cancelled/i)
  })

  it("rejects when Razorpay reports a payment.failed event", async () => {
    let failedHandler: ((response: unknown) => void) | undefined
    ;(window as any).Razorpay = vi.fn().mockImplementation(() => ({
      open: vi.fn(),
      on: (event: string, handler: (response: unknown) => void) => {
        if (event === "payment.failed") failedHandler = handler
      },
    }))

    const promise = openRazorpayCheckout(VALID_SESSION_DATA, {})
    await vi.waitFor(() => expect(failedHandler).toBeDefined())
    failedHandler!({})

    await expect(promise).rejects.toThrow(/payment failed/i)
  })
})
