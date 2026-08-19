import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const updateCart = vi.fn().mockResolvedValue(undefined)

vi.mock("@lib/data/cart", () => ({
  updateCart: (...args: unknown[]) => updateCart(...args),
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("step=review"),
}))

import Review from "./index"

const COMPLETED_CART = {
  shipping_address: { first_name: "Jane" },
  shipping_methods: [{ id: "sm_1" }],
  payment_collection: { id: "pay_col_1" },
  metadata: null,
} as any

describe("Review (checkout order note)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    updateCart.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders empty by default and saves to cart metadata after a pause", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    })
    render(<Review cart={COMPLETED_CART} />)

    const noteField = screen.getByTestId("order-note-input")
    expect(noteField).toHaveValue("")

    await user.type(noteField, "Please gift-wrap this")

    vi.advanceTimersByTime(600)

    await waitFor(() =>
      expect(updateCart).toHaveBeenCalledWith({
        metadata: { order_note: "Please gift-wrap this" },
      })
    )
  })

  it("preloads the field from existing cart metadata", () => {
    render(
      <Review
        cart={{ ...COMPLETED_CART, metadata: { order_note: "Leave at door" } }}
      />
    )

    expect(screen.getByTestId("order-note-input")).toHaveValue("Leave at door")
  })

  it("enforces a 500 character max length", () => {
    render(<Review cart={COMPLETED_CART} />)

    expect(screen.getByTestId("order-note-input")).toHaveAttribute(
      "maxLength",
      "500"
    )
  })
})
