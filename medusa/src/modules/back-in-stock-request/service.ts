import { MedusaService } from "@medusajs/framework/utils"
import BackInStockRequest from "./models/back-in-stock-request"

class BackInStockRequestModuleService extends MedusaService({
  BackInStockRequest,
}) {}

export default BackInStockRequestModuleService
