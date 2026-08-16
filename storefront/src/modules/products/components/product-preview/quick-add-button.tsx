"use client"

import { useState } from "react"
import { Button, Text } from "@medusajs/ui"
import { addToCart } from "@lib/data/cart"
import { trackAddToCart } from "@lib/util/analytics"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"

type QuickAddButtonProps = {
  product: HttpTypes.StoreProduct
  countryCode: string
  className?: string
}

export default function QuickAddButton({ product, countryCode, className }: QuickAddButtonProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const variant = product.variants?.[0]
  const inStock = (variant?.inventory_quantity ?? 0) > 0 || variant?.manage_inventory === false

  if (!variant || !inStock) return null

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsAdding(true)
    setAddError(null)
    try {
      await addToCart({ variantId: variant.id, quantity: 1, countryCode })
      const { variantPrice } = getProductPrice({ product, variantId: variant.id })
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
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add to cart")
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className={className}>
      <Button
        variant="primary"
        isLoading={isAdding}
        onClick={handleAddToCart}
        className="w-full h-9"
        data-testid="quick-add-button"
      >
        Add to cart
      </Button>
      {addError && (
        <Text className="text-ui-fg-error text-small-regular mt-2">{addError}</Text>
      )}
    </div>
  )
}
