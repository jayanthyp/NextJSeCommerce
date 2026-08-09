import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import CartTotals from "./index"

const baseTotals = {
  total: 118,
  subtotal: 100,
  tax_total: 18,
  currency_code: "usd",
  item_subtotal: 100,
  shipping_subtotal: 0,
  discount_subtotal: 0,
}

describe("CartTotals", () => {
  it("shows a Taxes line when prices are tax-exclusive", () => {
    render(
      <CartTotals
        totals={{ ...baseTotals, items: [{ is_tax_inclusive: false }] }}
      />
    )

    expect(screen.getByText("Taxes")).toBeInTheDocument()
    expect(screen.getByTestId("cart-taxes")).toHaveTextContent("$18.00")
  })

  it("hides the Taxes line when prices are tax-inclusive (e.g. India/GST)", () => {
    render(
      <CartTotals
        totals={{ ...baseTotals, items: [{ is_tax_inclusive: true }] }}
      />
    )

    expect(screen.queryByText("Taxes")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cart-taxes")).not.toBeInTheDocument()
    // The total itself already includes GST -- nothing else changes.
    expect(screen.getByTestId("cart-total")).toHaveTextContent("$118.00")
  })

  it("shows a Taxes line when there are no items to check (orders/carts pre-line-items)", () => {
    render(<CartTotals totals={{ ...baseTotals, items: undefined }} />)

    expect(screen.getByText("Taxes")).toBeInTheDocument()
  })
})
