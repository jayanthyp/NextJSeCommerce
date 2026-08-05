import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEWS_MODULE } from "../../../modules/reviews"
import ReviewsModuleService from "../../../modules/reviews/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: ReviewsModuleService = req.scope.resolve(REVIEWS_MODULE)
  const status = req.query.status as string | undefined

  const [reviews, count] = await service.listAndCountReviews(
    status ? { status } : {},
    { order: { created_at: "DESC" } }
  )
  res.json({ reviews, count })
}
