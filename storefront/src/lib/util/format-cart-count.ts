/**
 * Formats a cart item count for the nav badge: hidden at 0 (null), capped
 * display at "99+" beyond 99 so the badge never grows wider than its
 * circular shape can comfortably hold.
 */
export function formatCartCount(count: number): string | null {
  if (count <= 0) {
    return null
  }
  if (count > 99) {
    return "99+"
  }
  return String(count)
}
