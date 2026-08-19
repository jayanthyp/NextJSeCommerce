import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import Radio from "./index"

describe("Radio", () => {
  it("reflects aria-checked=true when checked", () => {
    render(<Radio checked={true} data-testid="radio" />)
    expect(screen.getByTestId("radio")).toHaveAttribute("aria-checked", "true")
  })

  it("reflects aria-checked=false when unchecked", () => {
    render(<Radio checked={false} data-testid="radio" />)
    expect(screen.getByTestId("radio")).toHaveAttribute(
      "aria-checked",
      "false"
    )
  })
})
