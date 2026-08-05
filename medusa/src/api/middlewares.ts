import { authenticate, defineMiddlewares } from "@medusajs/framework/http"

// /store/* routes are NOT auth-gated by default in Medusa v2 (unlike
// /admin/*) — routes that need a signed-in customer have to opt in
// explicitly here via `authenticate("customer", ...)`, which populates
// `req.auth_context.actor_id` for the route handler.
export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/reviews",
      method: "POST",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/wishlists",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/wishlists/share",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      // NOT /store/wishlists/shared/* — that route is deliberately public.
      matcher: "/store/wishlists/:itemId",
      method: "DELETE",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
  ],
})
