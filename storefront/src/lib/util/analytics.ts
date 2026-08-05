"use client"

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export type GA4Item = {
  item_id: string
  item_name: string
  price?: number
  quantity?: number
}

export const trackEvent = (name: string, params: Record<string, unknown>) => {
  if (typeof window === "undefined" || !window.gtag) {
    return
  }
  window.gtag("event", name, params)
}

export const trackViewItem = (item: GA4Item, currency: string) => {
  trackEvent("view_item", {
    currency,
    value: item.price ?? 0,
    items: [item],
  })
}

export const trackAddToCart = (item: GA4Item, currency: string) => {
  trackEvent("add_to_cart", {
    currency,
    value: (item.price ?? 0) * (item.quantity ?? 1),
    items: [item],
  })
}

export const trackBeginCheckout = (
  items: GA4Item[],
  currency: string,
  value: number
) => {
  trackEvent("begin_checkout", { currency, value, items })
}

// The order confirmation page can be reached via refresh/back-navigation
// after the purchase already fired once — GA4 purchase events are easy to
// double-count, so callers must gate this with an idempotency check (e.g.
// sessionStorage keyed on the order ID) before calling it.
export const trackPurchase = (
  orderId: string,
  items: GA4Item[],
  currency: string,
  value: number,
  shipping?: number,
  tax?: number
) => {
  trackEvent("purchase", {
    transaction_id: orderId,
    currency,
    value,
    shipping,
    tax,
    items,
  })
}
