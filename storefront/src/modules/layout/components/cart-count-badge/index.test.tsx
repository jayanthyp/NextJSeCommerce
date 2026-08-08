import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import CartCountBadge from "./index"

describe("CartCountBadge", () => {
  it("renders nothing when the cart is empty", () => {
    const { container } = render(<CartCountBadge count={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders the item count", () => {
    render(<CartCountBadge count={3} />)
    expect(screen.getByTestId("cart-count-badge")).toHaveTextContent("3")
  })

  it("caps the displayed count at 99+", () => {
    render(<CartCountBadge count={150} />)
    expect(screen.getByTestId("cart-count-badge")).toHaveTextContent("99+")
  })
})
