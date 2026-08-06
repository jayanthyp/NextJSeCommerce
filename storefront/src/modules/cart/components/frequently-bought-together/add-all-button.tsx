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
    try {
      // allSettled, not all: one out-of-stock suggestion shouldn't block
      // adding the rest, and a rejection here would otherwise leave
      // isAdding stuck true forever (no catch to reach setIsAdding(false)).
      await Promise.allSettled(
        variantIds.map((variantId) =>
          addToCart({ variantId, quantity: 1, countryCode })
        )
      )
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
