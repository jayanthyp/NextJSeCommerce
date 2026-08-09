import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const updateRegion = vi.fn()

vi.mock("@lib/data/cart", () => ({
  updateRegion: (...args: unknown[]) => updateRegion(...args),
}))
vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "in" }),
  usePathname: () => "/in/store",
}))

import CountrySelect from "./index"

// Mirrors the real shape closely enough for this component's own mapping
// logic (r.countries[].iso_2/display_name) -- a handful of the store's real
// regions, not all 16, to keep the fixture readable.
const REGIONS = [
  { id: "reg_in", countries: [{ iso_2: "in", display_name: "India" }] },
  { id: "reg_au", countries: [{ iso_2: "au", display_name: "Australia" }] },
  { id: "reg_eu", countries: [{ iso_2: "de", display_name: "Germany" }] },
  { id: "reg_us", countries: [{ iso_2: "us", display_name: "United States" }] },
] as any

describe("CountrySelect (header region switcher)", () => {
  it("only offers India and Australia, per issue #15's scoped launch", async () => {
    const user = userEvent.setup()
    render(<CountrySelect regions={REGIONS} />)

    await user.click(screen.getByTestId("region-switcher-button"))

    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(2)
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("India"),
        expect.stringContaining("Australia"),
      ])
    )
    expect(screen.queryByText("Germany")).not.toBeInTheDocument()
    expect(screen.queryByText("United States")).not.toBeInTheDocument()
  })
})
