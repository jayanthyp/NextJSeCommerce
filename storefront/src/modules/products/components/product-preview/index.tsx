import { Text } from "@medusajs/ui"
import { listProducts } from "@lib/data/products"
import { getProductPrice } from "@lib/util/get-product-price"
import { retrieveCustomer } from "@lib/data/customer"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "../thumbnail"
import PreviewPrice, { DiscountBadge } from "./price"
import WishlistQuickAction from "./wishlist-quick-action"
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

  const customer = await retrieveCustomer().catch(() => null)

  // Quick-add only applies to single-variant products — multi-variant
  // products keep the existing card-click-through to the PDP so the shopper
  // can pick a variant there (same reasoning as product-actions.tsx, which
  // this button's add-to-cart logic is a simplified extract of).
  const singleVariant =
    product.variants?.length === 1 ? product.variants[0] : undefined
  const showQuickAdd =
    !!singleVariant &&
    (!singleVariant.manage_inventory ||
      singleVariant.allow_backorder ||
      (singleVariant.inventory_quantity ?? 0) > 0)

  return (
    <LocalizedClientLink href={`/products/${product.handle}`} className="group">
      <div data-testid="product-wrapper">
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          isFeatured={isFeatured}
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
          topRightAction={
            product.id ? (
              <WishlistQuickAction
                productId={product.id}
                isLoggedIn={!!customer}
              />
            ) : undefined
          }
          hoverAction={
            showQuickAdd ? (
              <QuickAddButton
                product={product}
                variant={singleVariant!}
                className="hidden small:block w-full h-9"
                data-testid="quick-add-button-desktop"
              />
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
        {showQuickAdd && (
          <QuickAddButton
            product={product}
            variant={singleVariant!}
            className="small:hidden mt-2 w-full h-11"
            data-testid="quick-add-button-mobile"
          />
        )}
      </div>
    </LocalizedClientLink>
  )
}
