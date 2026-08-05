"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@medusajs/ui"

import { addToCart } from "@lib/data/cart"

const AddAllButton = ({ variantIds }: { variantIds: string[] }) => {
  const [isAdding, setIsAdding] = useState(false)
  const countryCode = useParams().countryCode as string

  const handleAddAll = async () => {
    setIsAdding(true)
    await Promise.all(
      variantIds.map((variantId) =>
        addToCart({ variantId, quantity: 1, countryCode })
      )
    )
    setIsAdding(false)
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
