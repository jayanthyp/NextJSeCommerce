import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PAGES_MODULE } from "../../../modules/pages"
import PagesModuleService from "../../../modules/pages/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: PagesModuleService = req.scope.resolve(PAGES_MODULE)
  const footerSection = req.query.footer_section as string | undefined

  const filters: Record<string, unknown> = { is_active: true }
  if (footerSection) {
    filters.footer_section = footerSection
  }

  const pages = await service.listPages(filters, { order: { rank: "ASC" } })
  res.json({ pages })
}
