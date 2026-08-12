import React from "react"
import { CreditCard } from "@medusajs/icons"

import Ideal from "@modules/common/icons/ideal"
import Bancontact from "@modules/common/icons/bancontact"
import PayPal from "@modules/common/icons/paypal"

// Single source of truth for the storefront's brand name — nav, footer,
// checkout header, page <title>s, and account copy all import this rather
// than hardcoding the name, so a rebrand is a one-line change.
export const SITE_NAME = "Structura Crafts"

/**
 * Scoped-down market launch (see issue #15) — the underlying region/
 * currency/shipping data for every other country added by
 * add-global-regions.ts is left completely intact (deliberately not a
 * destructive change), only what's *offered* as a selectable option in the
 * storefront's country-select controls (header region-switcher, checkout
 * address forms) is restricted here. A visitor already on another locale's
 * URL isn't blocked from browsing it; this only limits what shows up when
 * they pick a country from a dropdown.
 */
export const SELECTABLE_COUNTRY_CODES = ["in", "au"]

/**
 * Intent-based nav clusters for gift shoppers (see issue #65). Each entry's
 * `href` points at a collection listing that must exist in the Medusa
 * backend; when it doesn't, the collection page's own empty state is an
 * acceptable fallback -- the nav itself does no existence-checking. A
 * plain constant today, swappable for an admin-driven fetch later without
 * touching the components that consume it.
 */
export const GIFT_NAV: { label: string; items: { label: string; href: string }[] }[] = [
  {
    label: "Shop by Occasion",
    items: [
      { label: "Birthday", href: "/collections/birthday" },
      { label: "Anniversary", href: "/collections/anniversary" },
      { label: "Teacher's Day", href: "/collections/teachers-day" },
      { label: "Rakhi", href: "/collections/rakhi" },
      { label: "All Occasions", href: "/collections/occasions" },
    ],
  },
  {
    label: "Shop by Recipient",
    items: [
      { label: "For Him", href: "/collections/for-him" },
      { label: "For Her", href: "/collections/for-her" },
      { label: "For Mom", href: "/collections/for-mom" },
      { label: "For Dad", href: "/collections/for-dad" },
      { label: "All Recipients", href: "/collections/recipients" },
    ],
  },
]

/* Map of payment provider_id to their title and icon. Add in any payment providers you want to use. */
export const paymentInfoMap: Record<
  string,
  { title: string; icon: React.JSX.Element }
> = {
  pp_stripe_stripe: {
    title: "Credit card",
    icon: <CreditCard />,
  },
  "pp_medusa-payments_default": {
    title: "Credit card",
    icon: <CreditCard />,
  },
  "pp_stripe-ideal_stripe": {
    title: "iDeal",
    icon: <Ideal />,
  },
  "pp_stripe-bancontact_stripe": {
    title: "Bancontact",
    icon: <Bancontact />,
  },
  pp_paypal_paypal: {
    title: "PayPal",
    icon: <PayPal />,
  },
  pp_system_default: {
    title: "Manual Payment",
    icon: <CreditCard />,
  },
  // Add more payment providers here
}

// This only checks if it is native stripe or medusa payments for card payments, it ignores the other stripe-based providers
export const isStripeLike = (providerId?: string) => {
  return (
    providerId?.startsWith("pp_stripe_") || providerId?.startsWith("pp_medusa-")
  )
}

export const isPaypal = (providerId?: string) => {
  return providerId?.startsWith("pp_paypal")
}
export const isManual = (providerId?: string) => {
  return providerId?.startsWith("pp_system_default")
}

// Add currencies that don't need to be divided by 100
export const noDivisionCurrencies = [
  "krw",
  "jpy",
  "vnd",
  "clp",
  "pyg",
  "xaf",
  "xof",
  "bif",
  "djf",
  "gnf",
  "kmf",
  "mga",
  "rwf",
  "xpf",
  "htg",
  "vuv",
  "xag",
  "xdr",
  "xau",
]
