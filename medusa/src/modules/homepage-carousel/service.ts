import { MedusaService } from "@medusajs/framework/utils"
import CarouselSlide from "./models/carousel-slide"

class HomepageCarouselModuleService extends MedusaService({
  CarouselSlide,
}) {}

export default HomepageCarouselModuleService
