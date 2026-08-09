import { formatCartCount } from "@lib/util/format-cart-count"

type CartCountBadgeProps = {
  count: number
}

/**
 * Small circular badge overlaid on the cart icon (see cart-dropdown) --
 * hidden entirely at 0 items rather than rendering an empty/zero badge.
 */
const CartCountBadge = ({ count }: CartCountBadgeProps) => {
  const display = formatCartCount(count)

  if (!display) {
    return null
  }

  return (
    <span
      className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-ui-fg-base text-white text-[10px] leading-none pointer-events-none"
      data-testid="cart-count-badge"
      aria-hidden="true"
    >
      {display}
    </span>
  )
}

export default CartCountBadge
