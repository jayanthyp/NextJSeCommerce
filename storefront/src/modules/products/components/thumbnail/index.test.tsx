import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import Thumbnail from "./index"

describe("Thumbnail", () => {
  it("renders passed badges in an overlay slot", () => {
    render(
      <Thumbnail
        thumbnail="https://example.com/image.jpg"
        badges={<span data-testid="test-badge">-20%</span>}
      />
    )

    expect(screen.getByTestId("test-badge")).toBeInTheDocument()
  })

  it("renders no badge overlay when no badges are passed", () => {
    const { container } = render(
      <Thumbnail thumbnail="https://example.com/image.jpg" />
    )

    expect(container.querySelector(".top-2.left-2")).not.toBeInTheDocument()
  })
})
