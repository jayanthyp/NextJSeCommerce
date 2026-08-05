import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PAGES_MODULE } from "../../../../modules/pages"
import PagesModuleService from "../../../../modules/pages/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: PagesModuleService = req.scope.resolve(PAGES_MODULE)
  const { slug } = req.params

  const [page] = await service.listPages({ slug, is_active: true })

  if (!page) {
    res.status(404).json({ message: `Page "${slug}" not found` })
    return
  }

  res.json({ page })
}
