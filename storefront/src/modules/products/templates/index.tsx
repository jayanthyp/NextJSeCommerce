import { Suspense } from "react"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import RecentlyViewed from "@modules/products/components/recently-viewed"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

import ProductActionsWrapper from "./product-actions-wrapper"
import WishlistButton from "@modules/products/components/wishlist-button"
import { listProductReviews } from "@lib/data/reviews"
import { retrieveCustomer } from "@lib/data/customer"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
}

const ProductTemplate = async ({
  product,
  region,
  countryCode,
  images,
}: ProductTemplateProps) => {
  if (!product || !product.id) {
    return notFound()
  }

  const [reviews, customer] = await Promise.all([
    listProductReviews(product.id),
    retrieveCustomer().catch(() => null),
  ])

  return (
    <>
      <div
        className="content-container  flex flex-col small:flex-row small:items-start py-6 relative"
        data-testid="product-container"
      >
        {/* Mobile order (order-*): image first, then the buy box (variant
            picker + add to cart), then title/description/shipping/reviews —
            matching how most storefronts sequence a mobile PDP (the image
            and purchase action come before further reading, not after).
            Desktop (small:order-*) is untouched: same three-column layout
            and DOM order as before, so nothing changes above the "small"
            breakpoint. */}
        <div className="flex flex-col small:sticky small:top-48 small:py-0 small:max-w-[300px] w-full py-8 gap-y-6 order-3 small:order-1">
          <div className="flex items-start justify-between gap-x-4">
            <ProductInfo product={product} />
            <WishlistButton productId={product.id} isLoggedIn={!!customer} />
          </div>
          <ProductTabs product={product} reviews={reviews} isLoggedIn={!!customer} />
        </div>
        <div className="block w-full relative order-1 small:order-2">
          <ImageGallery images={images} />
        </div>
        <div className="flex flex-col small:sticky small:top-48 small:py-0 small:max-w-[300px] w-full py-8 gap-y-12 order-2 small:order-3">
          <ProductOnboardingCta />
          <Suspense
            fallback={
              <ProductActions
                disabled={true}
                product={product}
                region={region}
              />
            }
          >
            <ProductActionsWrapper id={product.id} region={region} />
          </Suspense>
        </div>
      </div>
      <div
        className="content-container my-16 small:my-32"
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
      <div className="content-container my-16 small:my-32">
        <RecentlyViewed product={product} countryCode={countryCode} />
      </div>
    </>
  )
}

export default ProductTemplate
