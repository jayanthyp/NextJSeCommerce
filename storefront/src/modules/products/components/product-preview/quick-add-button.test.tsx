import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { HttpTypes } from "@medusajs/types"

const addToCart = vi.fn()
const trackAddToCart = vi.fn()

vi.mock("@lib/data/cart", () => ({
  addToCart: (...args: unknown[]) => addToCart(...args),
}))
vi.mock("@lib/util/analytics", () => ({
  trackAddToCart: (...args: unknown[]) => trackAddToCart(...args),
}))
vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "us" }),
}))

import QuickAddButton from "./quick-add-button"

const variant = {
  id: "variant_1",
  calculated_price: {
    calculated_amount: 20,
    currency_code: "usd",
    original_amount: 20,
    calculated_price: { price_list_type: "default" },
  },
} as unknown as HttpTypes.StoreProductVariant

const product = {
  id: "prod_1",
  title: "T-Shirt",
  variants: [variant],
} as unknown as HttpTypes.StoreProduct

describe("QuickAddButton", () => {
  beforeEach(() => {
    addToCart.mockReset().mockResolvedValue(undefined)
    trackAddToCart.mockClear()
  })

  it("adds the variant to the cart and tracks the event on success", async () => {
    render(
      <QuickAddButton
        product={product}
        variant={variant}
        data-testid="quick-add"
      />
    )

    fireEvent.click(screen.getByTestId("quick-add"))

    await waitFor(() =>
      expect(addToCart).toHaveBeenCalledWith({
        variantId: "variant_1",
        quantity: 1,
        countryCode: "us",
      })
    )
    expect(trackAddToCart).toHaveBeenCalledWith(
      { item_id: "variant_1", item_name: "T-Shirt", price: 20, quantity: 1 },
      "usd"
    )
    expect(screen.queryByTestId("quick-add-error")).not.toBeInTheDocument()
  })

  it("does not navigate the enclosing link", () => {
    const onLinkClick = vi.fn((e: React.MouseEvent) => e.preventDefault())
    render(
      // eslint-disable-next-line jsx-a11y/anchor-is-valid
      <a href="/products/x" onClick={onLinkClick}>
        <QuickAddButton
          product={product}
          variant={variant}
          data-testid="quick-add"
        />
      </a>
    )

    fireEvent.click(screen.getByTestId("quick-add"))
    expect(onLinkClick).not.toHaveBeenCalled()
  })

  it("shows an error message when the add fails", async () => {
    addToCart.mockRejectedValue(new Error("Out of stock."))

    render(
      <QuickAddButton
        product={product}
        variant={variant}
        data-testid="quick-add"
      />
    )

    fireEvent.click(screen.getByTestId("quick-add"))

    await waitFor(() =>
      expect(screen.getByTestId("quick-add-error")).toHaveTextContent(
        "Out of stock."
      )
    )
  })
})
