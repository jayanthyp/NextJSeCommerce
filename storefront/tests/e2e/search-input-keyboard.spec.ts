import { test, expect } from "@playwright/test"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * Regression test for issue #121 (reopen of #117): the search field did not
 * accept text input. The prior spec used Playwright's fill(), which sets the
 * value programmatically and fires input events directly — it never
 * reproduced the real symptom (a field that appears non-editable, is
 * disabled/readOnly, or is overlaid by another element intercepting
 * focus/keystrokes).
 *
 * This spec reproduces the real user interaction: click the search icon to
 * open the search UI, focus the input, type real keystrokes, and assert the
 * input actually receives and retains the typed characters in the rendered
 * layout.
 */
test.describe("Search input keyboard interaction", () => {
  test("accepts and retains typed characters via real keyboard input", async ({
    page,
  }) => {
    await page.goto(`/${COUNTRY_CODE}`)

    // Open the search UI by clicking the search icon in the header.
    const searchButton = page.getByTestId("search-button")
    await searchButton.click()

    // The search input should be visible and editable (not disabled/readOnly).
    const searchInput = page.getByTestId("search-input")
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toBeEnabled()
    await expect(searchInput).not.toHaveAttribute("readonly", "")

    // Focus the input and type real keystrokes — this is what fill() skips.
    await searchInput.focus()
    await expect(searchInput).toBeFocused()
    await searchInput.type("Shirt")

    // The input must actually receive and retain the typed characters.
    await expect(searchInput).toHaveValue("Shirt")

    // Type more characters to prove the value is not reverted on each
    // keystroke (the controlled-input state bug from the issue).
    await searchInput.type("s")
    await expect(searchInput).toHaveValue("Shirts")
  })
})
