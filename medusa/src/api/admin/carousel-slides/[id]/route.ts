import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { HOMEPAGE_CAROUSEL_MODULE } from "../../../../modules/homepage-carousel"
import HomepageCarouselModuleService from "../../../../modules/homepage-carousel/service"

type UpdateSlideBody = {
  image_url?: string
  headline?: string
  subtext?: string | null
  cta_text?: string | null
  cta_link?: string | null
  rank?: number
  is_active?: boolean
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service: HomepageCarouselModuleService = req.scope.resolve(HOMEPAGE_CAROUSEL_MODULE)
  const { id } = req.params
  const body = req.body as UpdateSlideBody

  const slide = await service.updateCarouselSlides({ id, ...body })
  res.json({ carousel_slide: slide })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service: HomepageCarouselModuleService = req.scope.resolve(HOMEPAGE_CAROUSEL_MODULE)
  const { id } = req.params
  await service.deleteCarouselSlides(id)
  res.json({ id, object: "carousel_slide", deleted: true })
}
