import RazorpayConfigModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const RAZORPAY_CONFIG_MODULE = "razorpay_config"

export default Module(RAZORPAY_CONFIG_MODULE, {
  service: RazorpayConfigModuleService,
})
