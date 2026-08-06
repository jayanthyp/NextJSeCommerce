import AbandonedCartTrackingModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const ABANDONED_CART_TRACKING_MODULE = "abandoned_cart_tracking"

export default Module(ABANDONED_CART_TRACKING_MODULE, {
  service: AbandonedCartTrackingModuleService,
})
