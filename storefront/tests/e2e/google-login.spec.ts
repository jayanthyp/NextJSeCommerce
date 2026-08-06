import { test, expect } from "@playwright/test"
import { AuthPage } from "./pages/auth-page"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * A real OAuth round-trip against Google isn't realistically automatable in
 * CI (see the plan's own note on this) — no test environment has real
 * Google Cloud credentials. What IS testable: the button's visibility
 * correctly follows NEXT_PUBLIC_GOOGLE_AUTH_ENABLED (see
 * google-login-button/index.tsx), which is "false" in every environment
 * until real credentials are configured — so today it should be absent on
 * both the login and register views.
 */
test.describe("Google sign-in visibility", () => {
  test("is hidden on login and register views while unconfigured", async ({
    page,
  }) => {
    const auth = new AuthPage(page)
    await auth.goto(COUNTRY_CODE)

    await expect(page.getByTestId("google-login-button")).toHaveCount(0)

    await page.getByTestId("register-button").click()
    await expect(page.getByTestId("register-page")).toBeVisible()
    await expect(page.getByTestId("google-login-button")).toHaveCount(0)
  })
})
