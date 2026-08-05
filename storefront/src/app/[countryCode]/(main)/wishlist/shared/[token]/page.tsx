import { Metadata } from "next"

import { getSharedWishlist } from "@lib/data/wishlist"
import { listProducts } from "@lib/data/products"
import Product from "@modules/products/components/product-preview"
import { getRegion } from "@lib/data/regions"
import { SITE_NAME } from "@lib/constants"

export const metadata: Metadata = {
  title: `Shared wishlist | ${SITE_NAME}`,
}

type Props = {
  params: Promise<{ countryCode: string; token: string }>
}

// Public, no auth — possession of the token is the access control (see
// medusa/src/api/store/wishlists/shared/[token]/route.ts).
export default async function SharedWishlistPage(props: Props) {
  const { countryCode, token } = await props.params

  const [productIds, region] = await Promise.all([
    getSharedWishlist(token),
    getRegion(countryCode),
  ])

  if (!productIds.length || !region) {
    return (
      <div className="content-container py-12">
        <h1 className="text-2xl-semi mb-4">Shared wishlist</h1>
        <p className="text-ui-fg-subtle">
          This wishlist is empty or the link is no longer valid.
        </p>
      </div>
    )
  }

  const products = await listProducts({
    countryCode,
    queryParams: { id: productIds, limit: productIds.length },
  }).then(({ response }) => response.products)

  return (
    <div className="content-container py-12">
      <h1 className="text-2xl-semi mb-8">Shared wishlist</h1>
      <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8">
        {products.map((product) => (
          <li key={product.id}>
            <Product region={region} product={product} />
          </li>
        ))}
      </ul>
    </div>
  )
}
