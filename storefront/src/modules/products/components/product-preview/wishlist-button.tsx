"use client"

import { Heart } from "@modules/common/icons/heart"

type WishlistButtonProps = {
  filled: boolean
  onToggle: () => void
}

export default function WishlistButton({
  filled,
  onToggle,
}: WishlistButtonProps) {
  return (
    <div className="absolute top-2 right-2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center">
      <button
        type="button"
        aria-label={filled ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={filled}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggle()
        }}
        className="w-8 h-8 rounded-circle bg-ui-bg-base/80 backdrop-blur-sm flex items-center justify-center opacity-100 hover:bg-ui-bg-base hover:scale-105 transition-transform"
      >
        <Heart
          size="18"
          filled={filled}
          color={filled ? "text-ui-fg-interactive" : "text-ui-fg-base"}
        />
      </button>
    </div>
  )
}
