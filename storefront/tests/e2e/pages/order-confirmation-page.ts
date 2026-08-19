import { expect, type Page } from "@playwright/test"

export class OrderConfirmationPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async expectOrderConfirmed() {
    await expect(this.page.getByTestId("order-complete-container")).toBeVisible()
  }

  async getOrderId(): Promise<string> {
    return (await this.page.getByTestId("order-id").textContent())?.trim() ?? ""
  }

  async expectEmail(email: string) {
    await expect(this.page.getByTestId("order-email")).toContainText(email)
  }

  async expectPaymentMethod(name: string) {
    await expect(this.page.getByTestId("payment-method")).toContainText(name)
  }

  async expectOrderNote(note: string) {
    await expect(this.page.getByTestId("order-note")).toContainText(note)
  }

  async expectItemInSummary(productTitle: string) {
    const row = this.page.getByTestId("product-row").filter({
      has: this.page.getByTestId("product-name").filter({ hasText: productTitle }),
    })
    await expect(row).toBeVisible()
  }
}
