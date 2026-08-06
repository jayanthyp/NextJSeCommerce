import { MedusaService } from "@medusajs/framework/utils"
import AbandonedCartTracking from "./models/abandoned-cart-tracking"

class AbandonedCartTrackingModuleService extends MedusaService({
  AbandonedCartTracking,
}) {}

export default AbandonedCartTrackingModuleService
