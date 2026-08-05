import HomepageCarouselModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const HOMEPAGE_CAROUSEL_MODULE = "homepage_carousel"

export default Module(HOMEPAGE_CAROUSEL_MODULE, {
  service: HomepageCarouselModuleService,
})
