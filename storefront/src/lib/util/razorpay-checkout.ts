const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js"

type RazorpaySuccessResponse = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

type RazorpayInstance = {
  open: () => void
  on: (event: "payment.failed", handler: (response: unknown) => void) => void
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

let scriptLoadPromise: Promise<void> | null = null

/** Loads Checkout.js once and caches the in-flight/completed load across calls. */
function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) {
    return Promise.resolve()
  }
  if (scriptLoadPromise) {
    return scriptLoadPromise
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = RAZORPAY_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptLoadPromise = null
      reject(new Error("Failed to load the Razorpay Checkout script."))
    }
    document.body.appendChild(script)
  })

  return scriptLoadPromise
}

/**
 * Opens the Razorpay Checkout modal for a payment session created by the
 * backend's razorpay provider (see medusa/src/modules/razorpay/service.ts's
 * initiatePayment) and resolves with the signed payment confirmation once
 * the customer completes it, or rejects on failure/dismissal.
 *
 * `sessionData` is the payment session's own `data` field -- expected to
 * contain `id` (the Razorpay order id), `amount`, `currency`, and `key_id`
 * (the public key, safe to expose to the storefront -- see initiatePayment's
 * own comment on why key_id specifically is included there).
 */
export async function openRazorpayCheckout(
  sessionData: Record<string, unknown>,
  customer: { name?: string; email?: string; phone?: string }
): Promise<RazorpaySuccessResponse> {
  const orderId = sessionData.id as string | undefined
  const keyId = sessionData.key_id as string | undefined
  const amount = sessionData.amount as number | undefined
  const currency = sessionData.currency as string | undefined

  if (!orderId || !keyId || !amount || !currency) {
    throw new Error(
      "Razorpay payment session is missing required data (order id, key, amount, or currency)."
    )
  }

  await loadRazorpayScript()

  const RazorpayCtor = window.Razorpay
  if (!RazorpayCtor) {
    throw new Error("Razorpay Checkout failed to initialize.")
  }

  return new Promise((resolve, reject) => {
    const razorpay = new RazorpayCtor({
      key: keyId,
      order_id: orderId,
      amount,
      currency,
      name: "Structura Crafts",
      prefill: {
        name: customer.name,
        email: customer.email,
        contact: customer.phone,
      },
      handler: (response: RazorpaySuccessResponse) => resolve(response),
      modal: {
        // Checkout.js only calls `handler` on success; a dismissed modal
        // (customer closes it without paying) has to be caught here instead.
        ondismiss: () => reject(new Error("Payment was cancelled.")),
      },
    })

    razorpay.on("payment.failed", () => {
      reject(new Error("Payment failed. Please try again or use a different method."))
    })

    razorpay.open()
  })
}
