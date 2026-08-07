import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/us/store",
  useSearchParams: () => new URLSearchParams("sortBy=created_at"),
}))

import SortProducts from "./index"

describe("SortProducts", () => {
  beforeEach(() => {
    push.mockClear()
  })

  it("shows the label matching the current sortBy", () => {
    render(<SortProducts sortBy="price_desc" data-testid="sort-by-trigger" />)

    expect(screen.getByTestId("sort-by-trigger")).toHaveTextContent(
      "Price: High to Low"
    )
  })

  it("defaults to Latest Arrivals for an unrecognized value", () => {
    render(<SortProducts sortBy={"" as any} data-testid="sort-by-trigger" />)

    expect(screen.getByTestId("sort-by-trigger")).toHaveTextContent(
      "Latest Arrivals"
    )
  })

  it("selecting an option pushes the updated sortBy query param, preserving the rest", async () => {
    const user = userEvent.setup()
    render(<SortProducts sortBy="created_at" data-testid="sort-by-trigger" />)

    await user.click(screen.getByTestId("sort-by-trigger"))
    await user.click(screen.getByText("Price: Low to High"))

    expect(push).toHaveBeenCalledWith("/us/store?sortBy=price_asc")
  })
})
