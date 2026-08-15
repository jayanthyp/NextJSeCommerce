"use client"

import { useEffect, useState } from "react"
import { clx } from "@medusajs/ui"

import Heart from "@modules/common/icons/heart"
import { addToWishlist, getWishlist, removeFromWishlist } from "@lib/data/wishlist"
import { useLocalWishlist } from "@lib/hooks/use-wishlist"

// Grid-card quick-action, distinct from the product-detail-page
// WishlistButton: per the resolved persistence decision, this one has no
// auth gate — guests wishlist locally (useLocalWishlist) and signed-in
// customers wishlist through the same server-persisted store the PDP uses.
const WishlistQuickAction = ({
  productId,
  isLoggedIn,
}: {
  productId: string
  isLoggedIn: boolean
}) => {
  const local = useLocalWishlist(productId)
  const [itemId, setItemId] = useState<string | null>(null)
  const [pulsing, setPulsing] = useState(false)

  useEffect(() => {
    if (!isLoggedIn) return
    getWishlist().then((items) => {
      const match = items.find((i) => i.product_id === productId)
      setItemId(match?.id ?? null)
    })
  }, [productId, isLoggedIn])

  const filled = isLoggedIn ? !!itemId : local.isWishlisted
  const isWishlisted = filled

  const toggle = async (event: React.MouseEvent) => {
    // The card is wrapped in a LocalizedClientLink — without this the click
    // would also navigate to the PDP.
    event.preventDefault()
    event.stopPropagation()

    setPulsing(true)
    window.setTimeout(() => setPulsing(false), 200)

    if (!isLoggedIn) {
      local.toggle()
      return
    }

    // Optimistic: flip immediately, roll back only if the write fails.
    if (itemId) {
      const previous = itemId
      setItemId(null)
      await removeFromWishlist(previous).catch(() => setItemId(previous))
    } else {
      const res = await addToWishlist(productId).catch(() => null)
      setItemId((res as { wishlist_item: { id: string } })?.wishlist_item?.id ?? null)
    }
  }

  return (
    <div className="min-w-[44px] min-h-[44px] flex items-center justify-center">
      <button
        type="button"
        onClick={toggle}
        className={clx(
          "w-8 h-8 rounded-circle bg-ui-bg-base/80 backdrop-blur-sm flex items-center justify-center opacity-100 hover:bg-ui-bg-base hover:scale-105 transition-transform",
          { "animate-enter": pulsing }
        )}
        aria-label={filled ? "Remove from wishlist" : "Add to wishlist"}
        data-testid="wishlist-quick-action"
      >
        <Heart
          size="18"
          filled={filled}
          className={filled ? "text-ui-fg-interactive" : "text-ui-fg-base"}
        />
      </button>
    </div>
  )
}

export default WishlistQuickAction
