import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const loadMoreProducts = vi.fn()
let mockIsVisible = false

vi.mock("./load-more-products", () => ({
  loadMoreProducts: (...args: unknown[]) => loadMoreProducts(...args),
}))
vi.mock("@lib/hooks/use-in-view", () => ({
  useIntersection: () => mockIsVisible,
}))

import InfiniteProductGrid from "./infinite-product-grid"

const baseProps = {
  initialItems: [
    <li key="1" data-testid="item-1">
      Item 1
    </li>,
  ],
  initialPage: 1,
  initialTotalPages: 2,
  countryCode: "us",
}

describe("InfiniteProductGrid", () => {
  beforeEach(() => {
    loadMoreProducts.mockReset()
    mockIsVisible = false
  })

  it("renders the initial items and a sentinel when more pages exist", () => {
    render(<InfiniteProductGrid {...baseProps} />)

    expect(screen.getByTestId("item-1")).toBeInTheDocument()
    expect(screen.getByTestId("infinite-scroll-sentinel")).toBeInTheDocument()
  })

  it("renders no sentinel when there is only one page", () => {
    render(<InfiniteProductGrid {...baseProps} initialTotalPages={1} />)

    expect(
      screen.queryByTestId("infinite-scroll-sentinel")
    ).not.toBeInTheDocument()
  })

  it("fetches the next page once the sentinel becomes visible and appends the result", async () => {
    loadMoreProducts.mockResolvedValue({
      items: [
        <li key="2" data-testid="item-2">
          Item 2
        </li>,
      ],
      totalPages: 2,
    })

    const { rerender } = render(<InfiniteProductGrid {...baseProps} />)
    mockIsVisible = true
    rerender(<InfiniteProductGrid {...baseProps} />)

    await waitFor(() =>
      expect(loadMoreProducts).toHaveBeenCalledWith({
        page: 2,
        sortBy: undefined,
        collectionId: undefined,
        categoryId: undefined,
        productsIds: undefined,
        countryCode: "us",
      })
    )
    await waitFor(() => expect(screen.getByTestId("item-2")).toBeInTheDocument())
    // Original item is still there — appended, not replaced.
    expect(screen.getByTestId("item-1")).toBeInTheDocument()
  })

  it("stops showing the sentinel once the last page has been loaded", async () => {
    loadMoreProducts.mockResolvedValue({
      items: [
        <li key="2" data-testid="item-2">
          Item 2
        </li>,
      ],
      totalPages: 2,
    })

    const { rerender } = render(<InfiniteProductGrid {...baseProps} />)
    mockIsVisible = true
    rerender(<InfiniteProductGrid {...baseProps} />)

    await waitFor(() => expect(screen.getByTestId("item-2")).toBeInTheDocument())
    expect(
      screen.queryByTestId("infinite-scroll-sentinel")
    ).not.toBeInTheDocument()
  })

  it("does not trigger a second fetch while one is already in flight", async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    loadMoreProducts.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
    )

    const { rerender } = render(<InfiniteProductGrid {...baseProps} />)
    mockIsVisible = true
    rerender(<InfiniteProductGrid {...baseProps} />)
    rerender(<InfiniteProductGrid {...baseProps} />)

    await waitFor(() => expect(loadMoreProducts).toHaveBeenCalledTimes(1))

    resolveFetch({ items: [], totalPages: 2 })
  })

  it("shows a retry affordance on failure, and retrying tries again", async () => {
    loadMoreProducts.mockResolvedValueOnce({ error: "boom" })

    const { rerender } = render(<InfiniteProductGrid {...baseProps} />)
    mockIsVisible = true
    rerender(<InfiniteProductGrid {...baseProps} />)

    await waitFor(() =>
      expect(screen.getByTestId("infinite-scroll-retry")).toBeInTheDocument()
    )

    loadMoreProducts.mockResolvedValueOnce({
      items: [
        <li key="2" data-testid="item-2">
          Item 2
        </li>,
      ],
      totalPages: 2,
    })

    fireEvent.click(screen.getByTestId("infinite-scroll-retry"))

    await waitFor(() => expect(screen.getByTestId("item-2")).toBeInTheDocument())
  })
})
