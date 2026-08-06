import BackInStockRequestModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const BACK_IN_STOCK_REQUEST_MODULE = "back_in_stock_request"

export default Module(BACK_IN_STOCK_REQUEST_MODULE, {
  service: BackInStockRequestModuleService,
})
