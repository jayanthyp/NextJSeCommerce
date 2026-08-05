"use client"

import { useEffect, useState } from "react"

import Sun from "@modules/common/icons/sun"
import Moon from "@modules/common/icons/moon"
import { setThemePreference } from "@lib/data/theme"

// Mirrors the cookie into localStorage purely so a same-tab re-render (e.g.
// client-side navigation) can read the current choice without a server round
// trip — the cookie set by setThemePreference remains the source of truth
// for SSR on the next full load.
const ThemeToggle = () => {
  const [isDark, setIsDark] = useState<boolean | null>(null)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"))
  }, [])

  const toggle = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle("dark", next)
    window.localStorage.setItem("theme", next ? "dark" : "light")
    setThemePreference(next ? "dark" : "light")
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="hover:text-ui-fg-base flex items-center"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      data-testid="theme-toggle-button"
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  )
}

export default ThemeToggle
