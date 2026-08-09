import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
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
    const options = within(screen.getByTestId("sort-by-options"))
    await user.click(options.getByText("Price: Low to High"))

    expect(push).toHaveBeenCalledWith("/us/store?sortBy=price_asc")
  })

  it("renders a native select for mobile with the same options and current value", () => {
    render(<SortProducts sortBy="price_asc" data-testid="sort-by-trigger" />)

    const select = screen.getByTestId("sort-by-select-mobile") as HTMLSelectElement
    expect(select.value).toBe("price_asc")
    expect(
      Array.from(select.options).map((o) => [o.value, o.text])
    ).toEqual([
      ["created_at", "Latest Arrivals"],
      ["price_asc", "Price: Low to High"],
      ["price_desc", "Price: High to Low"],
    ])
  })

  it("selecting a native select option pushes the updated sortBy query param", async () => {
    const user = userEvent.setup()
    render(<SortProducts sortBy="created_at" data-testid="sort-by-trigger" />)

    await user.selectOptions(
      screen.getByTestId("sort-by-select-mobile"),
      "price_desc"
    )

    expect(push).toHaveBeenCalledWith("/us/store?sortBy=price_desc")
  })
})
