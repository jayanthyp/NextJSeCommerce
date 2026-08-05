import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { HOMEPAGE_CAROUSEL_MODULE } from "../../../modules/homepage-carousel"
import HomepageCarouselModuleService from "../../../modules/homepage-carousel/service"

// Keep in sync with the admin UI's own cap (medusa/src/admin/routes/carousel/page.tsx)
// and the storefront's defensive slice (storefront/src/modules/home/components/carousel).
const MAX_SLIDES = 8

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: HomepageCarouselModuleService = req.scope.resolve(HOMEPAGE_CAROUSEL_MODULE)
  const [carousel_slides, count] = await service.listAndCountCarouselSlides(
    {},
    { order: { rank: "ASC" } }
  )
  res.json({ carousel_slides, count })
}

type CreateSlideBody = {
  image_url: string
  headline: string
  subtext?: string | null
  cta_text?: string | null
  cta_link?: string | null
  rank?: number
  is_active?: boolean
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service: HomepageCarouselModuleService = req.scope.resolve(HOMEPAGE_CAROUSEL_MODULE)
  const body = req.body as CreateSlideBody

  if (!body.image_url || !body.headline) {
    res.status(400).json({ message: "image_url and headline are required" })
    return
  }

  const count = await service.listAndCountCarouselSlides({}).then(([, c]) => c)
  if (count >= MAX_SLIDES) {
    res.status(400).json({ message: `Maximum of ${MAX_SLIDES} slides reached` })
    return
  }

  const slide = await service.createCarouselSlides(body)
  res.json({ carousel_slide: slide })
}
