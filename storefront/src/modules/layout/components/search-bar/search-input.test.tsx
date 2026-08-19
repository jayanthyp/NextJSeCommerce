import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// Reproduce the #121 bug at the unit level: the @meilisearch/instant-meilisearch
// adapter does not propagate refine() back into useSearchBox's `query`, so a
// controlled `value={query}` input stays empty as the user types. Mock
// useSearchBox with a refine() that (like the buggy adapter) does NOT update
// `query`, then assert the input still reflects what the user typed.
const refine = vi.fn()

vi.mock("react-instantsearch", () => ({
  InstantSearch: ({ children }: { children: ReactNode }) => children,
  useSearchBox: () => ({ query: "", refine }),
  useHits: () => ({ items: [] }),
}))

import { SearchInput } from "./search-autocomplete"

describe("SearchInput", () => {
  it("renders typed text even though useSearchBox's query never reflects refine()", async () => {
    const user = userEvent.setup()
    render(<SearchInput onSubmit={() => {}} onNavigate={() => {}} />)

    const input = screen.getByTestId("search-input")
    await user.type(input, "shirt")

    expect(input).toHaveValue("shirt")
    expect(refine).toHaveBeenCalledWith("shirt")
  })
})
