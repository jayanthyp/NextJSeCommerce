import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const setThemePreference = vi.fn()

vi.mock("@lib/data/theme", () => ({
  setThemePreference: (...args: unknown[]) => setThemePreference(...args),
}))

import ThemeToggle from "./index"

describe("ThemeToggle", () => {
  beforeEach(() => {
    setThemePreference.mockClear()
    window.localStorage.clear()
    document.documentElement.classList.remove("dark")
  })

  afterEach(() => {
    document.documentElement.classList.remove("dark")
  })

  it("toggles the dark class, mirrors to localStorage, and persists via the server action", async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    const button = screen.getByTestId("theme-toggle-button")
    expect(document.documentElement.classList.contains("dark")).toBe(false)

    await user.click(button)

    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(window.localStorage.getItem("theme")).toBe("dark")
    expect(setThemePreference).toHaveBeenCalledWith("dark")

    await user.click(button)

    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(window.localStorage.getItem("theme")).toBe("light")
    expect(setThemePreference).toHaveBeenCalledWith("light")
  })

  it("picks up the dark class already applied by the server render on mount", () => {
    document.documentElement.classList.add("dark")
    render(<ThemeToggle />)

    expect(
      screen.getByTestId("theme-toggle-button").getAttribute("aria-label")
    ).toBe("Switch to light mode")
  })
})
