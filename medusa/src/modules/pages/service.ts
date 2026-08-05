import { MedusaService } from "@medusajs/framework/utils"
import Page from "./models/page"

class PagesModuleService extends MedusaService({
  Page,
}) {}

export default PagesModuleService
