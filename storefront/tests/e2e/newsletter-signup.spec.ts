import { test, expect } from "@playwright/test"
import { COUNTRY_CODE } from "./fixtures/test-data"

test.describe("Footer newsletter signup", () => {
  test("subscribing with a new email shows a success message", async ({
    page,
  }) => {
    await page.goto(`/${COUNTRY_CODE}/store`)

    const email = `e2e-newsletter-${Date.now()}@example.com`
    await page.getByTestId("newsletter-email-input").fill(email)
    await page.getByTestId("newsletter-signup-submit").click()

    await expect(
      page.getByTestId("newsletter-signup-success")
    ).toBeVisible()
    await expect(
      page.getByTestId("newsletter-signup-success")
    ).toContainText("Thanks for subscribing")
  })

  test("resubmitting the same email shows an already-subscribed message", async ({
    page,
  }) => {
    await page.goto(`/${COUNTRY_CODE}/store`)
    const email = `e2e-newsletter-dup-${Date.now()}@example.com`

    await page.getByTestId("newsletter-email-input").fill(email)
    await page.getByTestId("newsletter-signup-submit").click()
    await expect(page.getByTestId("newsletter-signup-success")).toBeVisible()

    await page.reload()
    await page.getByTestId("newsletter-email-input").fill(email)
    await page.getByTestId("newsletter-signup-submit").click()

    await expect(
      page.getByTestId("newsletter-signup-success")
    ).toContainText("already subscribed")
  })
})
