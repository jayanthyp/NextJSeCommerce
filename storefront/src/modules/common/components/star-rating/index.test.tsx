import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import StarRating from "./index"

describe("StarRating", () => {
  it("fills stars up to the given rating and leaves the rest muted", () => {
    render(<StarRating rating={3} />)

    const stars = screen.getAllByRole("button")
    expect(stars).toHaveLength(5)
    expect(stars[0]).toHaveClass("text-ui-fg-interactive")
    expect(stars[2]).toHaveClass("text-ui-fg-interactive")
    expect(stars[3]).toHaveClass("text-ui-fg-muted")
    expect(stars[4]).toHaveClass("text-ui-fg-muted")
  })

  it("is read-only (disabled) when no onChange is passed", () => {
    render(<StarRating rating={3} />)

    screen.getAllByRole("button").forEach((star) => expect(star).toBeDisabled())
  })

  it("calls onChange with the clicked star's value when interactive", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StarRating rating={0} onChange={onChange} />)

    await user.click(screen.getByLabelText("4 stars"))

    expect(onChange).toHaveBeenCalledWith(4)
  })
})
