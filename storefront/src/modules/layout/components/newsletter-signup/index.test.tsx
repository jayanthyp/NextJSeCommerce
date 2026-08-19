import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const subscribeToNewsletter = vi.fn()

vi.mock("@lib/data/marketing-consent", () => ({
  subscribeToNewsletter: (...args: unknown[]) => subscribeToNewsletter(...args),
}))

import NewsletterSignup from "./index"

describe("NewsletterSignup", () => {
  beforeEach(() => {
    subscribeToNewsletter.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("shows a success message for a new subscriber", async () => {
    subscribeToNewsletter.mockResolvedValue({
      success: true,
      alreadySubscribed: false,
    })
    const user = userEvent.setup()
    render(<NewsletterSignup />)

    await user.type(
      screen.getByTestId("newsletter-email-input"),
      "shopper@example.com"
    )
    await user.click(screen.getByTestId("newsletter-signup-submit"))

    await waitFor(() =>
      expect(screen.getByTestId("newsletter-signup-success")).toHaveTextContent(
        "Thanks for subscribing"
      )
    )
    expect(subscribeToNewsletter).toHaveBeenCalledWith("shopper@example.com")
  })

  it("shows a distinct message when already subscribed", async () => {
    subscribeToNewsletter.mockResolvedValue({
      success: true,
      alreadySubscribed: true,
    })
    const user = userEvent.setup()
    render(<NewsletterSignup />)

    await user.type(
      screen.getByTestId("newsletter-email-input"),
      "existing@example.com"
    )
    await user.click(screen.getByTestId("newsletter-signup-submit"))

    await waitFor(() =>
      expect(screen.getByTestId("newsletter-signup-success")).toHaveTextContent(
        "already subscribed"
      )
    )
  })

  it("shows an inline error without clearing the form on failure", async () => {
    subscribeToNewsletter.mockResolvedValue({
      success: false,
      message: "Please enter a valid email address.",
    })
    const user = userEvent.setup()
    render(<NewsletterSignup />)

    await user.type(
      screen.getByTestId("newsletter-email-input"),
      "bad@x"
    )
    await user.click(screen.getByTestId("newsletter-signup-submit"))

    await waitFor(() =>
      expect(screen.getByTestId("newsletter-signup-error")).toHaveTextContent(
        "Please enter a valid email address."
      )
    )
    expect(screen.getByTestId("newsletter-signup-form")).toBeInTheDocument()
  })
})
