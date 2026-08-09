import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const addMultipleToCart = vi.fn()

vi.mock("@lib/data/cart", () => ({
  addMultipleToCart: (...args: unknown[]) => addMultipleToCart(...args),
}))
vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "us" }),
}))

import AddAllButton from "./add-all-button"

describe("AddAllButton", () => {
  beforeEach(() => {
    addMultipleToCart.mockReset()
  })

  it("adds every variant and shows no error when all succeed", async () => {
    addMultipleToCart.mockResolvedValue({ failedCount: 0 })

    render(<AddAllButton variantIds={["v1", "v2", "v3"]} />)
    fireEvent.click(screen.getByTestId("add-all-suggested-button"))

    await waitFor(() =>
      expect(addMultipleToCart).toHaveBeenCalledWith(["v1", "v2", "v3"], "us")
    )
    expect(
      screen.queryByTestId("add-all-suggested-error")
    ).not.toBeInTheDocument()
  })

  // Regression test: addMultipleToCart used to swallow per-item failures
  // silently, so a partial add (e.g. one variant out of stock) looked
  // identical to full success from this button's point of view — the cart
  // ended up silently short an item with no indication anything went wrong.
  it("surfaces an error on a partial failure instead of silently reporting success", async () => {
    addMultipleToCart.mockResolvedValue({ failedCount: 1 })

    render(<AddAllButton variantIds={["v1", "v2", "v3"]} />)
    fireEvent.click(screen.getByTestId("add-all-suggested-button"))

    await waitFor(() =>
      expect(screen.getByTestId("add-all-suggested-error")).toHaveTextContent(
        "Added 2 of 3 items"
      )
    )
  })

  it("shows a full-failure message when nothing could be added", async () => {
    addMultipleToCart.mockResolvedValue({ failedCount: 3 })

    render(<AddAllButton variantIds={["v1", "v2", "v3"]} />)
    fireEvent.click(screen.getByTestId("add-all-suggested-button"))

    await waitFor(() =>
      expect(screen.getByTestId("add-all-suggested-error")).toHaveTextContent(
        "Couldn't add these items"
      )
    )
  })

  it("shows an error and re-enables the button if the whole call rejects", async () => {
    addMultipleToCart.mockRejectedValue(new Error("Network error"))

    render(<AddAllButton variantIds={["v1"]} />)
    const button = screen.getByTestId("add-all-suggested-button")
    fireEvent.click(button)

    await waitFor(() => expect(button).toBeEnabled())
    expect(screen.getByTestId("add-all-suggested-error")).toHaveTextContent(
      "Couldn't add these items"
    )
  })
})
