import { expect, type Page } from "@playwright/test"

type NewCustomer = {
  firstName: string
  lastName: string
  email: string
  password: string
}

export class AuthPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto(countryCode: string) {
    await this.page.goto(`/${countryCode}/account`)
  }

  /** Registers a brand-new customer and leaves them signed in. */
  async registerNewCustomer(countryCode: string, customer: NewCustomer) {
    await this.goto(countryCode)
    await this.page.getByTestId("register-button").click()
    await expect(this.page.getByTestId("register-page")).toBeVisible()

    await this.page.getByTestId("first-name-input").fill(customer.firstName)
    await this.page.getByTestId("last-name-input").fill(customer.lastName)
    await this.page.getByTestId("email-input").fill(customer.email)
    await this.page.getByTestId("password-input").fill(customer.password)
    await this.page.getByTestId("register-button").click()

    // The URL stays "/account" for both the signed-out (login/register) and
    // signed-in (dashboard) views — they're parallel-route slots, not
    // separate pages — so presence of AccountNav is the real "signed in"
    // signal, not a URL change. AccountNav only mounts once `customer` is
    // truthy (see account-layout.tsx), so checking it's *attached* (not
    // necessarily visible) works regardless of viewport — its mobile/desktop
    // sub-blocks toggle visibility via CSS per breakpoint, and the overview
    // page content is itself deliberately `hidden` below the "small"
    // breakpoint (see overview/index.tsx), so a visibility check on either
    // would fail depending on viewport.
    await expect(this.page.getByTestId("mobile-account-nav")).toBeAttached({
      timeout: 15_000,
    })
  }
}
