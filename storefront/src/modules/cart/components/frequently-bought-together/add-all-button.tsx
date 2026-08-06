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
      // Sequential, not Promise.all: concurrent createLineItem calls against
      // the *same* cart race on Medusa's optimistic-concurrency cart version
      // and can stall well past a reasonable UI timeout under constrained
      // resources (observed hanging in CI). One at a time avoids the race;
      // a failed add (e.g. one suggestion out of stock) still lets the rest
      // through since each iteration is caught independently.
      for (const variantId of variantIds) {
        await addToCart({ variantId, quantity: 1, countryCode }).catch(
          () => void 0
        )
      }
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
