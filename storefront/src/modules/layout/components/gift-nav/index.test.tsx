import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "in" }),
}))

import GiftNav from "./index"
import { GIFT_NAV } from "@lib/constants"

describe("GiftNav", () => {
  it("renders a trigger for each configured category, panels closed by default", () => {
    render(<GiftNav />)

    GIFT_NAV.forEach((category) => {
      const trigger = screen.getByText(category.label)
      expect(trigger).toBeInTheDocument()
      expect(trigger.closest("button")).toHaveAttribute("aria-expanded", "false")
    })

    expect(screen.queryByText("Birthday")).not.toBeInTheDocument()
  })

  it("opens a category's panel on hover and links to its collection routes", async () => {
    const user = userEvent.setup()
    render(<GiftNav />)

    const occasionTrigger = screen.getByTestId("gift-nav-trigger-0")
    await user.hover(occasionTrigger)

    expect(occasionTrigger).toHaveAttribute("aria-expanded", "true")

    const birthdayLink = await screen.findByText("Birthday")
    expect(birthdayLink.closest("a")).toHaveAttribute("href", "/in/collections/birthday")
  })

  it("opens a category's panel on keyboard focus", () => {
    render(<GiftNav />)

    const recipientTrigger = screen.getByTestId("gift-nav-trigger-1")
    fireEvent.focus(recipientTrigger)

    expect(recipientTrigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("For Him")).toBeInTheDocument()
  })
})
