import type {
  MedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { REVIEWS_MODULE } from "../../../modules/reviews"
import ReviewsModuleService from "../../../modules/reviews/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: ReviewsModuleService = req.scope.resolve(REVIEWS_MODULE)
  const productId = req.query.product_id as string | undefined

  if (!productId) {
    res.status(400).json({ message: "product_id query param is required" })
    return
  }

  const reviews = await service.listReviews(
    { product_id: productId, status: "approved" },
    { order: { created_at: "DESC" } }
  )
  res.json({ reviews })
}

type CreateReviewBody = {
  product_id: string
  rating: number
  title?: string
  content: string
}

export async function POST(req: MedusaStoreRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Sign in to leave a review" })
    return
  }

  const body = req.body as CreateReviewBody
  if (!body.product_id || !body.rating || !body.content) {
    res.status(400).json({
      message: "product_id, rating, and content are required",
    })
    return
  }
  if (body.rating < 1 || body.rating > 5) {
    res.status(400).json({ message: "rating must be between 1 and 5" })
    return
  }

  // Verified-purchase check: resolve it server-side entirely — the client
  // never supplies an order_id, we look up the customer's own orders and
  // find one containing the product being reviewed. This has to sit here
  // (not in the reviews module itself), since it needs cross-module data
  // the reviews module shouldn't own — mirrors the pattern in
  // src/subscribers/order-placed.ts for resolving Modules.ORDER.
  //
  // Deliberately not filtered on order.status === "completed" or
  // payment_status === "captured": this project's only payment provider is
  // Manual Payment, which never auto-captures (capture is a separate,
  // explicit admin action in Admin) and order.status only ever flips to
  // "completed" via an explicit admin bulk-complete action — neither
  // happens as part of a normal customer checkout here, so requiring either
  // would mean no customer could ever leave a review. A non-canceled,
  // non-draft order containing the product is what "verified purchase"
  // actually means for this store's checkout flow.
  const orderModuleService = req.scope.resolve(Modules.ORDER)
  const orders = await orderModuleService.listOrders(
    { customer_id: customerId },
    { relations: ["items"] }
  )

  const qualifyingOrder = orders.find(
    (order) =>
      order.status !== "canceled" &&
      order.status !== "draft" &&
      order.items?.some((item) => item.product_id === body.product_id)
  )

  if (!qualifyingOrder) {
    res.status(403).json({
      message: "You can only review products from your own orders",
    })
    return
  }

  const reviewsService: ReviewsModuleService = req.scope.resolve(REVIEWS_MODULE)

  const customerModuleService = req.scope.resolve(Modules.CUSTOMER)
  const customer = await customerModuleService
    .retrieveCustomer(customerId)
    .catch(() => null)

  const review = await reviewsService.createReviews({
    product_id: body.product_id,
    order_id: qualifyingOrder.id,
    customer_id: customerId,
    customer_name: customer
      ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null
      : null,
    rating: body.rating,
    title: body.title || null,
    content: body.content,
    status: "pending",
  })

  res.json({ review })
}
