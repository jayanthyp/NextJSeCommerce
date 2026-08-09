import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEWS_MODULE } from "../../../../modules/reviews"
import ReviewsModuleService from "../../../../modules/reviews/service"

// Batch/aggregate counterpart to GET /store/reviews — fetching a catalog
// grid's worth of products one review-list request each would be an N+1
// call per page load. This returns just the average + count per product so
// the grid can render a rating row without pulling every review's content.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: ReviewsModuleService = req.scope.resolve(REVIEWS_MODULE)

  const raw = req.query.product_id
  const productIds = Array.isArray(raw) ? raw : raw ? [raw] : []

  if (!productIds.length) {
    res.json({ summaries: {} })
    return
  }

  const reviews = await service.listReviews({
    product_id: productIds as string[],
    status: "approved",
  })

  const summaries: Record<string, { average: number; count: number }> = {}

  for (const review of reviews) {
    const existing = summaries[review.product_id] ?? { average: 0, count: 0 }
    const total = existing.average * existing.count + review.rating
    existing.count += 1
    existing.average = total / existing.count
    summaries[review.product_id] = existing
  }

  res.json({ summaries })
}
