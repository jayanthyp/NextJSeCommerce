import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEWS_MODULE } from "../../../../modules/reviews"
import ReviewsModuleService from "../../../../modules/reviews/service"

type UpdateReviewBody = {
  status?: "pending" | "approved" | "rejected"
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service: ReviewsModuleService = req.scope.resolve(REVIEWS_MODULE)
  const { id } = req.params
  const body = req.body as UpdateReviewBody

  const review = await service.updateReviews({ id, ...body })
  res.json({ review })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service: ReviewsModuleService = req.scope.resolve(REVIEWS_MODULE)
  const { id } = req.params
  await service.deleteReviews(id)
  res.json({ id, object: "review", deleted: true })
}
