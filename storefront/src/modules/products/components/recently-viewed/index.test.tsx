import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { HttpTypes } from "@medusajs/types"

const recordProductView = vi.fn()
const useRecentlyViewed = vi.fn()
const listProducts = vi.fn()

vi.mock("@lib/hooks/use-recently-viewed", () => ({
  recordProductView: (...args: unknown[]) => recordProductView(...args),
  useRecentlyViewed: (...args: unknown[]) => useRecentlyViewed(...args),
}))
vi.mock("@lib/data/products", () => ({
  listProducts: (...args: unknown[]) => listProducts(...args),
}))
vi.mock("@modules/common/components/localized-client-link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))
vi.mock("@modules/products/components/thumbnail", () => ({
  default: () => <div data-testid="thumbnail" />,
}))

import RecentlyViewed from "./index"

const currentProduct = { id: "current", handle: "sweatshirt" } as HttpTypes.StoreProduct

const makeProduct = (id: string, title: string, handle: string) =>
  ({
    id,
    title,
    handle,
    images: [],
    variants: [],
  }) as unknown as HttpTypes.StoreProduct

describe("RecentlyViewed", () => {
  beforeEach(() => {
    recordProductView.mockClear()
    useRecentlyViewed.mockReset()
    listProducts.mockReset()
  })

  it("records the current product view on mount", () => {
    useRecentlyViewed.mockReturnValue([])
    render(<RecentlyViewed product={currentProduct} countryCode="us" />)

    expect(recordProductView).toHaveBeenCalledWith({
      id: "current",
      handle: "sweatshirt",
    })
  })

  it("renders nothing when there is no viewing history", () => {
    useRecentlyViewed.mockReturnValue([])
    const { container } = render(
      <RecentlyViewed product={currentProduct} countryCode="us" />
    )

    expect(container).toBeEmptyDOMElement()
    expect(listProducts).not.toHaveBeenCalled()
  })

  it("fetches and shows previously viewed products, most-recent-first", async () => {
    useRecentlyViewed.mockReturnValue([
      { id: "1", handle: "t-shirt" },
      { id: "2", handle: "shorts" },
    ])
    listProducts.mockResolvedValue({
      response: {
        // Deliberately returned out of order — component must reorder by
        // the entries array, not trust the API's order.
        products: [
          makeProduct("2", "Shorts", "shorts"),
          makeProduct("1", "T-Shirt", "t-shirt"),
        ],
      },
    })

    render(<RecentlyViewed product={currentProduct} countryCode="us" />)

    await waitFor(() =>
      expect(screen.getByTestId("recently-viewed")).toBeInTheDocument()
    )
    const titles = screen.getAllByText(/T-Shirt|Shorts/).map((el) => el.textContent)
    expect(titles).toEqual(["T-Shirt", "Shorts"])
  })
})
