"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@medusajs/ui"

import { addMultipleToCart } from "@lib/data/cart"
import ErrorMessage from "@modules/checkout/components/error-message"

const AddAllButton = ({ variantIds }: { variantIds: string[] }) => {
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const countryCode = useParams().countryCode as string

  const handleAddAll = async () => {
    setIsAdding(true)
    setError(null)
    try {
      // One Server Action call that resolves the cart once and adds every
      // item sequentially against it (see addMultipleToCart) — looping
      // addToCart here previously re-resolved the cart/region on every
      // single item (2 round trips per item instead of 1), which is what
      // made this button prone to blowing past CI's timeout under load.
      // addMultipleToCart still attempts every item even if one fails, and
      // reports how many via a return value rather than throwing (a thrown
      // Server Action error's message gets redacted in production) —
      // surface that rather than silently reporting success on a cart
      // that's missing an item.
      const { failedCount } = await addMultipleToCart(variantIds, countryCode)
      if (failedCount > 0) {
        setError(
          failedCount === variantIds.length
            ? "Couldn't add these items to your cart. Please try again."
            : `Added ${variantIds.length - failedCount} of ${variantIds.length} items — the rest couldn't be added (maybe out of stock).`
        )
      }
    } catch {
      setError("Couldn't add these items to your cart. Please try again.")
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div>
      <Button
        variant="secondary"
        size="small"
        onClick={handleAddAll}
        isLoading={isAdding}
        data-testid="add-all-suggested-button"
      >
        Add all to cart
      </Button>
      <ErrorMessage error={error} data-testid="add-all-suggested-error" />
    </div>
  )
}

export default AddAllButton
