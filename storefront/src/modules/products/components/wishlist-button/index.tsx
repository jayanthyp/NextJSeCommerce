"use client"

import { useEffect, useState } from "react"

import Heart from "@modules/common/icons/heart"
import { addToWishlist, getWishlist, removeFromWishlist } from "@lib/data/wishlist"

const WishlistButton = ({
  productId,
  isLoggedIn,
}: {
  productId: string
  isLoggedIn: boolean
}) => {
  const [itemId, setItemId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isLoggedIn) return
    getWishlist().then((items) => {
      const match = items.find((i) => i.product_id === productId)
      setItemId(match?.id ?? null)
    })
  }, [productId, isLoggedIn])

  if (!isLoggedIn) {
    return null
  }

  const toggle = async () => {
    setLoading(true)
    if (itemId) {
      await removeFromWishlist(itemId)
      setItemId(null)
    } else {
      const res = await addToWishlist(productId)
      setItemId((res as any)?.wishlist_item?.id ?? null)
    }
    setLoading(false)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className="hover:text-ui-fg-base text-ui-fg-subtle"
      aria-label={itemId ? "Remove from wishlist" : "Add to wishlist"}
      data-testid="wishlist-button"
    >
      <Heart size={20} filled={!!itemId} />
    </button>
  )
}

export default WishlistButton
