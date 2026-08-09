import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import WhatsAppButton from "./index"

describe("WhatsAppButton", () => {
  const original = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER

  afterEach(() => {
    process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER = original
  })

  it("renders nothing when no support number is configured", () => {
    delete process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER
    const { container } = render(<WhatsAppButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders a wa.me link built from digits-only of the configured number", () => {
    process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER = "+91 98765 43210"
    render(<WhatsAppButton />)

    const link = screen.getByTestId("whatsapp-button")
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("https://wa.me/919876543210")
    )
  })

  it("opens in a new tab with a safe rel attribute", () => {
    process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER = "919876543210"
    render(<WhatsAppButton />)

    const link = screen.getByTestId("whatsapp-button")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("has an accessible label", () => {
    process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER = "919876543210"
    render(<WhatsAppButton />)

    expect(
      screen.getByLabelText("Chat with us on WhatsApp")
    ).toBeInTheDocument()
  })
})
