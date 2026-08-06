import type {
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http"
import { BACK_IN_STOCK_REQUEST_MODULE } from "../../../modules/back-in-stock-request"
import BackInStockRequestModuleService from "../../../modules/back-in-stock-request/service"

export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Sign in to view your notify requests" })
    return
  }

  const service: BackInStockRequestModuleService = req.scope.resolve(
    BACK_IN_STOCK_REQUEST_MODULE
  )
  const requests = await service.listBackInStockRequests({
    customer_id: customerId,
  })
  res.json({ back_in_stock_requests: requests })
}

type CreateRequestBody = {
  variant_id: string
  product_id: string
}

export async function POST(req: MedusaStoreRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Sign in to get notified" })
    return
  }

  const body = req.body as CreateRequestBody
  if (!body.variant_id || !body.product_id) {
    res.status(400).json({ message: "variant_id and product_id are required" })
    return
  }

  const service: BackInStockRequestModuleService = req.scope.resolve(
    BACK_IN_STOCK_REQUEST_MODULE
  )

  const [existing] = await service.listBackInStockRequests({
    customer_id: customerId,
    variant_id: body.variant_id,
  })
  if (existing) {
    res.json({ back_in_stock_request: existing })
    return
  }

  const request = await service.createBackInStockRequests({
    customer_id: customerId,
    variant_id: body.variant_id,
    product_id: body.product_id,
  })
  res.json({ back_in_stock_request: request })
}
