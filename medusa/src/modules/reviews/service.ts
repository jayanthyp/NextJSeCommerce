import { MedusaService } from "@medusajs/framework/utils"
import Review from "./models/review"

class ReviewsModuleService extends MedusaService({
  Review,
}) {}

export default ReviewsModuleService
