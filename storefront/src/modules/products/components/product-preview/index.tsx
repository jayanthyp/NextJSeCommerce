import { Text } from "@medusajs/ui"
import { listProducts } from "@lib/data/products"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "../thumbnail"
import PreviewPrice, { DiscountBadge } from "./price"
import QuickAddButton from "./quick-add-button"

export default async function ProductPreview({
  product,
  isFeatured,
  region,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
}) {
  // const pricedProduct = await listProducts({
  //   regionId: region.id,
  //   queryParams: { id: [product.id!] },
  // }).then(({ response }) => response.products[0])

  // if (!pricedProduct) {
  //   return null
  // }

  const { cheapestPrice } = getProductPrice({
    product,
  })

  // No dedicated product field for this yet — same untyped-metadata pattern
  // as other ad hoc product flags in this codebase.
  const isBestseller = product.metadata?.bestseller === "true"
  const showDiscountBadge =
    !!cheapestPrice &&
    cheapestPrice.price_type === "sale" &&
    cheapestPrice.percentage_diff !== "0"

  const isSingleVariant = product.variants?.length === 1

  return (
    <LocalizedClientLink href={`/products/${product.handle}`} className="group">
      <div data-testid="product-wrapper">
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          isFeatured={isFeatured}
          hoverAction={
            isSingleVariant ? (
              <QuickAddButton
                product={product}
                className="hidden small:flex absolute bottom-0 inset-x-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              />
            ) : undefined
          }
          badges={
            showDiscountBadge || isBestseller ? (
              <>
                {showDiscountBadge && <DiscountBadge price={cheapestPrice} />}
                {isBestseller && (
                  <Text
                    className="bg-ui-bg-base text-ui-fg-base rounded-full px-2 py-0.5 text-xsmall-regular"
                    data-testid="bestseller-badge"
                  >
                    Bestseller
                  </Text>
                )}
              </>
            ) : undefined
          }
        />
        <div className="flex txt-compact-medium mt-4 justify-between">
          <Text className="text-ui-fg-subtle" data-testid="product-title">
            {product.title}
          </Text>
          <div className="flex items-center gap-x-2">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
        </div>
        {isSingleVariant && (
          <QuickAddButton
            product={product}
            className="small:hidden mt-2 w-full"
          />
        )}
      </div>
    </LocalizedClientLink>
  )
}
