import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import CountrySelect from "./index"

// A region with more countries than just India/Australia -- mirrors the
// real "Europe" region shape (multiple countries under one region), which
// is exactly the case that needs filtering in checkout address forms.
const MULTI_COUNTRY_REGION = {
  id: "reg_eu",
  countries: [
    { iso_2: "de", display_name: "Germany" },
    { iso_2: "fr", display_name: "France" },
    { iso_2: "in", display_name: "India" },
    { iso_2: "au", display_name: "Australia" },
  ],
} as any

describe("CountrySelect (checkout address form)", () => {
  it("only offers countries on the launch allowlist, even if the cart's region has more", () => {
    render(
      <CountrySelect
        name="shipping_address.country_code"
        region={MULTI_COUNTRY_REGION}
        data-testid="shipping-country-select"
      />
    )

    const select = screen.getByTestId("shipping-country-select") as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)

    expect(values).toEqual(expect.arrayContaining(["in", "au"]))
    expect(values).not.toContain("de")
    expect(values).not.toContain("fr")
  })
})
