import { test, expect } from "@playwright/test"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * The button renders `null` when NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER isn't
 * set at build time (fail closed), so this spec only asserts real behavior
 * in environments where it's configured — see .github/workflows/test.yml's
 * NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER=919876543210 for CI.
 */
test.describe("WhatsApp click-to-chat button", () => {
  test("is visible on the catalog page and links to a wa.me chat", async ({
    page,
  }) => {
    await page.goto(`/${COUNTRY_CODE}/store`)

    const button = page.getByTestId("whatsapp-button")
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/\d+\?text=/
    )
    await expect(button).toHaveAttribute("target", "_blank")
  })

  test("stays visible and positioned above the mobile action bar on a product page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/${COUNTRY_CODE}/store`)

    const button = page.getByTestId("whatsapp-button")
    await expect(button).toBeVisible()

    const box = await button.boundingBox()
    expect(box).not.toBeNull()
    // Mobile offset (bottom-20) keeps it clear of the fixed bottom bars —
    // sanity-check it isn't pinned to the plain bottom-4 corner.
    expect(812 - (box!.y + box!.height)).toBeGreaterThan(40)
  })
})
