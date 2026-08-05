import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { HOMEPAGE_CAROUSEL_MODULE } from "../../../modules/homepage-carousel"
import HomepageCarouselModuleService from "../../../modules/homepage-carousel/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: HomepageCarouselModuleService = req.scope.resolve(HOMEPAGE_CAROUSEL_MODULE)
  const slides = await service.listCarouselSlides(
    { is_active: true },
    { order: { rank: "ASC" }, take: 8 }
  )
  res.json({ carousel_slides: slides })
}
