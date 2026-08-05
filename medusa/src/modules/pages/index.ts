import PagesModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const PAGES_MODULE = "pages"

export default Module(PAGES_MODULE, {
  service: PagesModuleService,
})
