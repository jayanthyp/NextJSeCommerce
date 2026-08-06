import type {
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http"
import { BACK_IN_STOCK_REQUEST_MODULE } from "../../../../modules/back-in-stock-request"
import BackInStockRequestModuleService from "../../../../modules/back-in-stock-request/service"

export async function DELETE(req: MedusaStoreRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Sign in to manage your notify requests" })
    return
  }

  const service: BackInStockRequestModuleService = req.scope.resolve(
    BACK_IN_STOCK_REQUEST_MODULE
  )
  const { id } = req.params

  const request = await service.retrieveBackInStockRequest(id).catch(() => null)
  if (!request || request.customer_id !== customerId) {
    res.status(404).json({ message: "Request not found" })
    return
  }

  await service.deleteBackInStockRequests(id)
  res.json({ id, object: "back_in_stock_request", deleted: true })
}
