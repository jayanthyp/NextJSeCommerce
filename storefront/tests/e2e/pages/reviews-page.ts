import { expect, type Page } from "@playwright/test"

export class ReviewsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async openReviewsTab() {
    const item = this.page.getByTestId("reviews-accordion-item")
    await item.getByRole("button").click()
    await expect(item.getByTestId("reviews-tab")).toBeVisible()
  }

  async submitReview({
    rating,
    title,
    content,
  }: {
    rating: number
    title?: string
    content: string
  }) {
    const item = this.page.getByTestId("reviews-accordion-item")
    await item.getByRole("button", { name: `${rating} star${rating > 1 ? "s" : ""}` }).click()

    if (title) {
      await item.getByPlaceholder("Review title (optional)").fill(title)
    }
    await item.getByPlaceholder("Share your thoughts about this product").fill(content)
    await item.getByRole("button", { name: "Submit review" }).click()
  }

  async expectSubmissionConfirmed() {
    await expect(
      this.page.getByText(/your review has been submitted/i)
    ).toBeVisible()
  }

  async expectSignInPrompt() {
    const item = this.page.getByTestId("reviews-accordion-item")
    await expect(
      item.getByText(/sign in to leave a review/i)
    ).toBeVisible()
  }
}
