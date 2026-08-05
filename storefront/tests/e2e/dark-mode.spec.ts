import { test, expect } from "@playwright/test"
import { ThemeTogglePage } from "./pages/theme-toggle-page"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * Dark mode: default resolution from OS preference, manual override via the
 * header toggle, and persistence across a reload (cookie-backed).
 */
test.describe("Dark mode", () => {
  test("defaults to the OS color-scheme preference", async ({ browser }) => {
    const darkContext = await browser.newContext({ colorScheme: "dark" })
    const darkPage = await darkContext.newPage()
    const darkToggle = new ThemeTogglePage(darkPage)
    await darkToggle.goto(COUNTRY_CODE)
    expect(await darkToggle.isDark()).toBe(true)
    await darkContext.close()

    const lightContext = await browser.newContext({ colorScheme: "light" })
    const lightPage = await lightContext.newPage()
    const lightToggle = new ThemeTogglePage(lightPage)
    await lightToggle.goto(COUNTRY_CODE)
    expect(await lightToggle.isDark()).toBe(false)
    await lightContext.close()
  })

  test("manual toggle overrides the OS preference and persists across reload", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "light" })
    const page = await context.newPage()
    const themeToggle = new ThemeTogglePage(page)

    await themeToggle.goto(COUNTRY_CODE)
    expect(await themeToggle.isDark()).toBe(false)

    await themeToggle.toggle()
    expect(await themeToggle.isDark()).toBe(true)

    await page.reload()
    expect(await themeToggle.isDark()).toBe(true)

    await context.close()
  })
})
