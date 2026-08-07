import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const setConsent = vi.fn().mockResolvedValue(undefined)

vi.mock("@lib/data/consent", () => ({
  setConsent: (...args: unknown[]) => setConsent(...args),
}))

import CookieConsentBanner from "./index"

describe("CookieConsentBanner", () => {
  beforeEach(() => {
    setConsent.mockClear()
    ;(window as any).gtag = vi.fn()
  })

  afterEach(() => {
    delete (window as any).gtag
  })

  it("is visible when consent is unset", () => {
    render(<CookieConsentBanner initialConsent="unset" />)
    expect(screen.getByTestId("cookie-consent-banner")).toBeInTheDocument()
  })

  it("stays hidden when consent was already granted or denied", () => {
    const { rerender } = render(
      <CookieConsentBanner initialConsent="granted" />
    )
    expect(
      screen.queryByTestId("cookie-consent-banner")
    ).not.toBeInTheDocument()

    rerender(<CookieConsentBanner initialConsent="denied" />)
    expect(
      screen.queryByTestId("cookie-consent-banner")
    ).not.toBeInTheDocument()
  })

  it("Accept persists granted consent, updates gtag, and hides the banner", async () => {
    const user = userEvent.setup()
    render(<CookieConsentBanner initialConsent="unset" />)

    await user.click(screen.getByTestId("cookie-consent-accept"))

    await waitFor(() =>
      expect(
        screen.queryByTestId("cookie-consent-banner")
      ).not.toBeInTheDocument()
    )
    expect(setConsent).toHaveBeenCalledWith(true)
    expect(window.gtag).toHaveBeenCalledWith("consent", "update", {
      analytics_storage: "granted",
    })
  })

  it("Reject persists denied consent and updates gtag accordingly", async () => {
    const user = userEvent.setup()
    render(<CookieConsentBanner initialConsent="unset" />)

    await user.click(screen.getByTestId("cookie-consent-reject"))

    await waitFor(() =>
      expect(
        screen.queryByTestId("cookie-consent-banner")
      ).not.toBeInTheDocument()
    )
    expect(setConsent).toHaveBeenCalledWith(false)
    expect(window.gtag).toHaveBeenCalledWith("consent", "update", {
      analytics_storage: "denied",
    })
  })
})
