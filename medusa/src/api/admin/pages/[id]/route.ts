import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PAGES_MODULE } from "../../../../modules/pages"
import PagesModuleService from "../../../../modules/pages/service"

type UpdatePageBody = {
  title?: string
  slug?: string
  content?: string
  footer_section?: "support" | "policies" | null
  rank?: number
  is_active?: boolean
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service: PagesModuleService = req.scope.resolve(PAGES_MODULE)
  const { id } = req.params
  const body = req.body as UpdatePageBody

  if (body.slug) {
    const [existing] = await service.listPages({ slug: body.slug })
    if (existing && existing.id !== id) {
      res.status(400).json({ message: `A page with slug "${body.slug}" already exists` })
      return
    }
  }

  const page = await service.updatePages({ id, ...body })
  res.json({ page })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service: PagesModuleService = req.scope.resolve(PAGES_MODULE)
  const { id } = req.params
  await service.deletePages(id)
  res.json({ id, object: "page", deleted: true })
}
