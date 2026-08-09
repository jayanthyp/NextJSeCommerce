import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import OrderDetails from "./index"

const BASE_ORDER = {
  email: "shopper@example.com",
  created_at: "2026-01-01T00:00:00Z",
  display_id: 42,
  fulfillment_status: "not_fulfilled",
  payment_status: "captured",
  metadata: null,
} as any

describe("OrderDetails order note", () => {
  it("does not render an order-note row when no note was left", () => {
    render(<OrderDetails order={BASE_ORDER} />)
    expect(screen.queryByTestId("order-note")).not.toBeInTheDocument()
  })

  it("renders the order note from order metadata", () => {
    render(
      <OrderDetails
        order={{ ...BASE_ORDER, metadata: { order_note: "Leave at door" } }}
      />
    )
    expect(screen.getByTestId("order-note")).toHaveTextContent(
      "Leave at door"
    )
  })
})
