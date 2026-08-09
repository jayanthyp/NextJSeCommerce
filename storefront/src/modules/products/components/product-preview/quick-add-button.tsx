"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Button, Text } from "@medusajs/ui"
import { HttpTypes } from "@medusajs/types"

import { addToCart } from "@lib/data/cart"
import { getProductPrice } from "@lib/util/get-product-price"
import { trackAddToCart } from "@lib/util/analytics"

// Grid-card quick-add for single-variant products — extracted/simplified
// from product-actions/index.tsx's handleAddToCart (no OptionSelect/
// MobileActions here since there's nothing to select). ProductPreview only
// renders this when the product has exactly one, in-stock variant; a
// successful add is confirmed by the existing cart-dropdown-opens-on-item-
// count-change behavior (see layout/components/cart-dropdown), so there's
// no separate success indicator to build here.
const QuickAddButton = ({
  product,
  variant,
  className,
  "data-testid": dataTestid,
}: {
  product: HttpTypes.StoreProduct
  variant: HttpTypes.StoreProductVariant
  className?: string
  "data-testid"?: string
}) => {
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const countryCode = useParams().countryCode as string

  const handleAddToCart = async (event: React.MouseEvent) => {
    // The card is wrapped in a LocalizedClientLink — without this the click
    // would also navigate to the PDP.
    event.preventDefault()
    event.stopPropagation()

    setIsAdding(true)
    setAddError(null)

    try {
      await addToCart({ variantId: variant.id, quantity: 1, countryCode })

      const { variantPrice } = getProductPrice({
        product,
        variantId: variant.id,
      })

      if (variantPrice) {
        trackAddToCart(
          {
            item_id: variant.id,
            item_name: product.title,
            price: variantPrice.calculated_price_number,
            quantity: 1,
          },
          variantPrice.currency_code
        )
      }
    } catch (error) {
      setAddError(
        error instanceof Error
          ? error.message
          : "Something went wrong adding this item to your cart."
      )
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className={className}>
      <Button
        onClick={handleAddToCart}
        isLoading={isAdding}
        variant="primary"
        className="w-full h-full"
        data-testid={dataTestid}
      >
        Add to cart
      </Button>
      {addError && (
        <Text
          className="text-ui-fg-error txt-small mt-1"
          data-testid={dataTestid ? `${dataTestid}-error` : undefined}
        >
          {addError}
        </Text>
      )}
    </div>
  )
}

export default QuickAddButton
