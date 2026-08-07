import { test, expect } from "@playwright/test"
import { ThemeTogglePage } from "./pages/theme-toggle-page"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * Only the OS-preference default remains here: it exercises the real
 * pre-hydration inline script (src/app/layout.tsx) against a real browser's
 * `matchMedia`, which isn't meaningfully replicable in jsdom. The toggle
 * button's click/localStorage/server-action behavior and reload persistence
 * are covered by the ThemeToggle unit test
 * (src/modules/layout/components/theme-toggle/index.test.tsx) — cookie
 * read-on-SSR is the same well-established pattern used for theme/consent
 * elsewhere in this project.
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
})
