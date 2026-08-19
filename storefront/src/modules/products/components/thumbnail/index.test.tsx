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

  it("renders a passed top-right action in its own overlay slot", () => {
    render(
      <Thumbnail
        thumbnail="https://example.com/image.jpg"
        topRightAction={<button data-testid="test-action">♥</button>}
      />
    )

    expect(screen.getByTestId("test-action")).toBeInTheDocument()
  })

  it("renders no top-right overlay when no action is passed", () => {
    const { container } = render(
      <Thumbnail thumbnail="https://example.com/image.jpg" />
    )

    expect(container.querySelector(".top-2.right-2")).not.toBeInTheDocument()
  })

  it("renders a passed hover action in its own overlay slot", () => {
    render(
      <Thumbnail
        thumbnail="https://example.com/image.jpg"
        hoverAction={<button data-testid="test-hover-action">Add to cart</button>}
      />
    )

    expect(screen.getByTestId("test-hover-action")).toBeInTheDocument()
  })

  it("renders no hover-action overlay when none is passed", () => {
    const { container } = render(
      <Thumbnail thumbnail="https://example.com/image.jpg" />
    )

    expect(container.querySelector(".bottom-0.inset-x-0")).not.toBeInTheDocument()
  })
})
