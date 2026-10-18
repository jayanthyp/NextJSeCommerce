import { test, expect } from "@playwright/test"
import { COUNTRY_CODE } from "./fixtures/test-data"

/**
 * Same 1024px `small` breakpoint used by responsive-header.spec.ts -- below
 * it the desktop gift-nav dropdowns are hidden and the mobile SideMenu
 * accordion sections take over.
 */
const MOBILE_VIEWPORT = { width: 375, height: 812 }

test.describe("Gift shop navigation (issue #65)", () => {
  test("desktop: opens the Shop by Occasion dropdown on hover and routes to its collection", async ({
    page,
  }) => {
    await page.goto(`/${COUNTRY_CODE}`)

    const occasionTrigger = page.getByTestId("gift-nav-trigger-0")
    await expect(occasionTrigger).toBeVisible()
    await expect(occasionTrigger).toHaveAttribute("aria-expanded", "false")

    await occasionTrigger.hover()
    const panel = page.getByTestId("gift-nav-panel-0")
    await expect(panel).toBeVisible()
    await expect(occasionTrigger).toHaveAttribute("aria-expanded", "true")

    await panel.getByRole("link", { name: "Birthday" }).click()
    await expect(page).toHaveURL(new RegExp(`/${COUNTRY_CODE}/collections/birthday$`))
  })

  test("desktop: opens the Shop by Recipient dropdown on hover and routes to its collection", async ({
    page,
  }) => {
    await page.goto(`/${COUNTRY_CODE}`)

    const recipientTrigger = page.getByTestId("gift-nav-trigger-1")
    await recipientTrigger.hover()

    const panel = page.getByTestId("gift-nav-panel-1")
    await expect(panel).toBeVisible()

    await panel.getByRole("link", { name: "For Her" }).click()
    await expect(page).toHaveURL(new RegExp(`/${COUNTRY_CODE}/collections/for-her$`))
  })

  test("mobile: gift nav sections are reachable inside the side menu without overflow", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT })
    const page = await context.newPage()
    await page.goto(`/${COUNTRY_CODE}`)

    // Desktop dropdown triggers stay out of the accessibility tree below
    // `small` -- the mobile accordion toggles are the only way in.
    await expect(page.getByTestId("gift-nav-trigger-0")).toBeHidden()

    await page.getByTestId("nav-menu-button").click()
    await expect(page.getByTestId("nav-menu-popup")).toBeVisible()

    const occasionToggle = page.getByTestId("gift-nav-mobile-toggle-0")
    await expect(occasionToggle).toBeVisible()
    await expect(occasionToggle).toHaveAttribute("aria-expanded", "false")

    await occasionToggle.click()
    await expect(occasionToggle).toHaveAttribute("aria-expanded", "true")

    const birthdayLink = page.getByRole("link", { name: "Birthday" })
    await expect(birthdayLink).toBeVisible()
    await birthdayLink.click()
    await expect(page).toHaveURL(new RegExp(`/${COUNTRY_CODE}/collections/birthday$`))

    await context.close()
  })
})
