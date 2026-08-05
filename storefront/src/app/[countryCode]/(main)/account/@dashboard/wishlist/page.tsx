import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveCustomer } from "@lib/data/customer"
import { getWishlist, getWishlistShareToken } from "@lib/data/wishlist"
import { listProducts } from "@lib/data/products"
import Wishlist from "@modules/account/components/wishlist"

export const metadata: Metadata = {
  title: "Wishlist",
  description: "View your wishlist",
}

export default async function WishlistPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const customer = await retrieveCustomer()

  if (!customer) {
    notFound()
  }

  const [items, shareToken] = await Promise.all([
    getWishlist(),
    getWishlistShareToken(),
  ])

  const products = items.length
    ? await listProducts({
        countryCode,
        queryParams: { id: items.map((i) => i.product_id), limit: items.length },
      }).then(({ response }) => response.products)
    : []

  const productById = new Map(products.map((p) => [p.id, p]))
  const enrichedItems = items.map((item) => ({
    ...item,
    product: productById.get(item.product_id),
  }))

  return (
    <div className="w-full" data-testid="wishlist-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Wishlist</h1>
        <p className="text-base-regular">
          Products you've saved for later. Share your wishlist with a link,
          handy for gift lists.
        </p>
      </div>
      <Wishlist items={enrichedItems} shareToken={shareToken} />
    </div>
  )
}
