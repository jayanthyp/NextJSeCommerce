import type {
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http"
import { WISHLIST_MODULE } from "../../../modules/wishlist"
import WishlistModuleService from "../../../modules/wishlist/service"

export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Sign in to view your wishlist" })
    return
  }

  const service: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)
  const items = await service.listWishlistItems(
    { customer_id: customerId },
    { order: { created_at: "DESC" } }
  )
  res.json({ wishlist_items: items })
}

type AddItemBody = {
  product_id: string
}

export async function POST(req: MedusaStoreRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Sign in to use your wishlist" })
    return
  }

  const body = req.body as AddItemBody
  if (!body.product_id) {
    res.status(400).json({ message: "product_id is required" })
    return
  }

  const service: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)

  const [existing] = await service.listWishlistItems({
    customer_id: customerId,
    product_id: body.product_id,
  })
  if (existing) {
    res.json({ wishlist_item: existing })
    return
  }

  const item = await service.createWishlistItems({
    customer_id: customerId,
    product_id: body.product_id,
  })
  res.json({ wishlist_item: item })
}
