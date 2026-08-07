import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@lib/data/customer", () => ({
  loginWithOAuth: vi.fn(),
}))

import GoogleLoginButton from "./index"

describe("GoogleLoginButton", () => {
  const original = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED

  beforeEach(() => {
    delete (process.env as any).NEXT_PUBLIC_GOOGLE_AUTH_ENABLED
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = original
  })

  it("renders nothing while Google auth is unconfigured", () => {
    const { container } = render(<GoogleLoginButton />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByTestId("google-login-button")).not.toBeInTheDocument()
  })

  it("renders the button once Google auth is enabled", () => {
    process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = "true"
    render(<GoogleLoginButton />)
    expect(screen.getByTestId("google-login-button")).toBeInTheDocument()
  })
})
