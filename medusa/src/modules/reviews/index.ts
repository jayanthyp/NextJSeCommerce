import ReviewsModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const REVIEWS_MODULE = "reviews"

export default Module(REVIEWS_MODULE, {
  service: ReviewsModuleService,
})
