import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PAGES_MODULE } from "../../../modules/pages"
import PagesModuleService from "../../../modules/pages/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: PagesModuleService = req.scope.resolve(PAGES_MODULE)
  const [pages, count] = await service.listAndCountPages(
    {},
    { order: { rank: "ASC" } }
  )
  res.json({ pages, count })
}

type CreatePageBody = {
  title: string
  slug: string
  content: string
  footer_section?: "support" | "policies" | null
  rank?: number
  is_active?: boolean
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service: PagesModuleService = req.scope.resolve(PAGES_MODULE)
  const body = req.body as CreatePageBody

  if (!body.title || !body.slug || !body.content) {
    res.status(400).json({ message: "title, slug, and content are required" })
    return
  }

  const [existing] = await service.listPages({ slug: body.slug })
  if (existing) {
    res.status(400).json({ message: `A page with slug "${body.slug}" already exists` })
    return
  }

  const page = await service.createPages(body)
  res.json({ page })
}
