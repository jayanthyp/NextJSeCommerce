"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@medusajs/ui"

import { addMultipleToCart } from "@lib/data/cart"

const AddAllButton = ({ variantIds }: { variantIds: string[] }) => {
  const [isAdding, setIsAdding] = useState(false)
  const countryCode = useParams().countryCode as string

  const handleAddAll = async () => {
    setIsAdding(true)
    try {
      // One Server Action call that resolves the cart once and adds every
      // item sequentially against it (see addMultipleToCart) — looping
      // addToCart here previously re-resolved the cart/region on every
      // single item (2 round trips per item instead of 1), which is what
      // made this button prone to blowing past CI's timeout under load.
      await addMultipleToCart(variantIds, countryCode)
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Button
      variant="secondary"
      size="small"
      onClick={handleAddAll}
      isLoading={isAdding}
      data-testid="add-all-suggested-button"
    >
      Add all to cart
    </Button>
  )
}

export default AddAllButton
