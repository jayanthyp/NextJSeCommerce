import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import CategoryFilter from "./category-filter"

const categories = [
  { id: "cat_1", name: "Shirts" },
  { id: "cat_2", name: "Pants" },
]

describe("CategoryFilter", () => {
  it("renders nothing when there are no categories", () => {
    const { container } = render(
      <CategoryFilter categories={[]} selectedIds={[]} onChange={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("marks selected categories as active", () => {
    render(
      <CategoryFilter
        categories={categories}
        selectedIds={["cat_1"]}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByTestId("category-checkbox-cat_1")).toBeChecked()
    expect(screen.getByTestId("category-checkbox-cat_2")).not.toBeChecked()
  })

  it("adds an id to the selection when an unselected category is clicked", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CategoryFilter
        categories={categories}
        selectedIds={["cat_1"]}
        onChange={onChange}
      />
    )

    await user.click(screen.getByTestId("category-checkbox-cat_2"))

    expect(onChange).toHaveBeenCalledWith(["cat_1", "cat_2"])
  })

  it("removes an id from the selection when a selected category is clicked", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CategoryFilter
        categories={categories}
        selectedIds={["cat_1", "cat_2"]}
        onChange={onChange}
      />
    )

    await user.click(screen.getByTestId("category-checkbox-cat_1"))

    expect(onChange).toHaveBeenCalledWith(["cat_2"])
  })
})
