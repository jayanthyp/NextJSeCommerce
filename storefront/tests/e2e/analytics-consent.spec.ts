import { test, expect } from "@playwright/test"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * Cookie-consent banner: shown on first visit, Accept/Reject persist via
 * cookie so it doesn't reappear on reload. The dataLayer/gtag assertions are
 * conditional on NEXT_PUBLIC_GA4_MEASUREMENT_ID actually being configured
 * (the Analytics component no-ops without it, which is the current default
 * — a real GA4 property is a manual setup step outside this repo) so this
 * spec still passes meaningfully before that's set up.
 */
test.describe("Cookie consent banner", () => {
  test("shows on first visit and Accept persists across reload", async ({
    page,
  }) => {
    await page.goto(`/${COUNTRY_CODE}`)

    const banner = page.getByTestId("cookie-consent-banner")
    await expect(banner).toBeVisible()

    await page.getByTestId("cookie-consent-accept").click()
    await expect(banner).not.toBeVisible()

    await page.reload()
    await expect(banner).not.toBeVisible()
  })

  test("Reject persists across reload and does not grant analytics_storage", async ({
    page,
  }) => {
    await page.goto(`/${COUNTRY_CODE}`)

    const banner = page.getByTestId("cookie-consent-banner")
    await expect(banner).toBeVisible()

    await page.getByTestId("cookie-consent-reject").click()
    await expect(banner).not.toBeVisible()

    await page.reload()
    await expect(banner).not.toBeVisible()

    const hasGtag = await page.evaluate(() => typeof window.gtag === "function")
    if (hasGtag) {
      const dataLayer = await page.evaluate(() => window.dataLayer)
      const consentDefault = (dataLayer as unknown[]).find(
        (entry: any) => entry?.[0] === "consent" && entry?.[1] === "default"
      ) as any
      expect(consentDefault?.[2]?.analytics_storage).toBe("denied")
    }
  })
})
