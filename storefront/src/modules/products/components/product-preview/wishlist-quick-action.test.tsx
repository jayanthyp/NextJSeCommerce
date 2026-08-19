import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const getWishlist = vi.fn()
const addToWishlist = vi.fn()
const removeFromWishlist = vi.fn()

vi.mock("@lib/data/wishlist", () => ({
  getWishlist: (...args: unknown[]) => getWishlist(...args),
  addToWishlist: (...args: unknown[]) => addToWishlist(...args),
  removeFromWishlist: (...args: unknown[]) => removeFromWishlist(...args),
}))

import WishlistQuickAction from "./wishlist-quick-action"

describe("WishlistQuickAction", () => {
  beforeEach(() => {
    window.localStorage.clear()
    getWishlist.mockReset().mockResolvedValue([])
    addToWishlist.mockReset().mockResolvedValue({ wishlist_item: { id: "wi_1" } })
    removeFromWishlist.mockReset().mockResolvedValue({})
  })

  it("guest: toggles a local-only wishlist state without calling the server", async () => {
    render(<WishlistQuickAction productId="prod_1" isLoggedIn={false} />)

    const button = screen.getByTestId("wishlist-quick-action")
    expect(button).toHaveAttribute("aria-label", "Add to wishlist")

    fireEvent.click(button)
    expect(button).toHaveAttribute("aria-label", "Remove from wishlist")
    expect(addToWishlist).not.toHaveBeenCalled()

    fireEvent.click(button)
    expect(button).toHaveAttribute("aria-label", "Add to wishlist")
    expect(getWishlist).not.toHaveBeenCalled()
  })

  it("guest: does not navigate the enclosing link", () => {
    const onLinkClick = vi.fn((e: React.MouseEvent) => e.preventDefault())
    render(
      // eslint-disable-next-line jsx-a11y/anchor-is-valid
      <a href="/products/x" onClick={onLinkClick}>
        <WishlistQuickAction productId="prod_1" isLoggedIn={false} />
      </a>
    )

    fireEvent.click(screen.getByTestId("wishlist-quick-action"))
    expect(onLinkClick).not.toHaveBeenCalled()
  })

  it("signed-in: reflects existing server wishlist membership", async () => {
    getWishlist.mockResolvedValue([{ id: "wi_1", product_id: "prod_1" }])

    render(<WishlistQuickAction productId="prod_1" isLoggedIn={true} />)

    await waitFor(() =>
      expect(screen.getByTestId("wishlist-quick-action")).toHaveAttribute(
        "aria-label",
        "Remove from wishlist"
      )
    )
  })

  it("signed-in: adds via the server on toggle when not yet wishlisted", async () => {
    render(<WishlistQuickAction productId="prod_1" isLoggedIn={true} />)

    await waitFor(() => expect(getWishlist).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId("wishlist-quick-action"))

    await waitFor(() => expect(addToWishlist).toHaveBeenCalledWith("prod_1"))
  })

  it("signed-in: removes via the server on toggle when already wishlisted", async () => {
    getWishlist.mockResolvedValue([{ id: "wi_1", product_id: "prod_1" }])

    render(<WishlistQuickAction productId="prod_1" isLoggedIn={true} />)

    await waitFor(() =>
      expect(screen.getByTestId("wishlist-quick-action")).toHaveAttribute(
        "aria-label",
        "Remove from wishlist"
      )
    )

    fireEvent.click(screen.getByTestId("wishlist-quick-action"))

    await waitFor(() => expect(removeFromWishlist).toHaveBeenCalledWith("wi_1"))
  })
})
