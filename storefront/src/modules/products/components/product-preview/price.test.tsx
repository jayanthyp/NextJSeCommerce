import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { VariantPrice } from "types/global"
import { DiscountBadge } from "./price"

const salePrice = (percentageDiff: string): VariantPrice => ({
  calculated_price_number: 80,
  calculated_price: "$80.00",
  original_price_number: 100,
  original_price: "$100.00",
  currency_code: "usd",
  price_type: "sale",
  percentage_diff: percentageDiff,
})

describe("DiscountBadge", () => {
  it("renders the discount percentage for a sale price", () => {
    render(<DiscountBadge price={salePrice("20")} />)

    expect(screen.getByTestId("discount-badge")).toHaveTextContent("-20%")
  })

  it("renders nothing when there is no price", () => {
    const { container } = render(<DiscountBadge price={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing for a non-sale price", () => {
    const { container } = render(
      <DiscountBadge price={{ ...salePrice("20"), price_type: "default" }} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing for a 0% diff so it never shows -0%", () => {
    const { container } = render(<DiscountBadge price={salePrice("0")} />)

    expect(container).toBeEmptyDOMElement()
  })
})
