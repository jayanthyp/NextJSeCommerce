"use client"

import { useState } from "react"
import { HttpTypes } from "@medusajs/types"
import { Button, Text } from "@medusajs/ui"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"
import { removeFromWishlist, WishlistItem } from "@lib/data/wishlist"

type EnrichedItem = WishlistItem & { product?: HttpTypes.StoreProduct }

const Wishlist = ({
  items,
  shareToken,
}: {
  items: EnrichedItem[]
  shareToken: string | null
}) => {
  const [localItems, setLocalItems] = useState(items)
  const [copied, setCopied] = useState(false)

  const remove = async (itemId: string) => {
    setLocalItems((prev) => prev.filter((i) => i.id !== itemId))
    await removeFromWishlist(itemId)
  }

  const copyShareLink = () => {
    if (!shareToken) return
    const url = `${window.location.origin}${window.location.pathname.split("/account")[0]}/wishlist/shared/${shareToken}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!localItems.length) {
    return <Text className="text-ui-fg-subtle">Your wishlist is empty.</Text>
  }

  return (
    <div className="flex flex-col gap-y-6">
      {shareToken && (
        <div>
          <Button variant="secondary" size="small" onClick={copyShareLink}>
            {copied ? "Link copied!" : "Copy shareable link"}
          </Button>
        </div>
      )}
      <ul className="grid grid-cols-2 small:grid-cols-4 gap-x-6 gap-y-8">
        {localItems.map((item) =>
          item.product ? (
            <li key={item.id} className="flex flex-col gap-y-2">
              <LocalizedClientLink href={`/products/${item.product.handle}`}>
                <Thumbnail thumbnail={item.product.thumbnail} size="full" />
              </LocalizedClientLink>
              <div className="flex items-center justify-between">
                <Text className="txt-compact-medium text-ui-fg-subtle">
                  {item.product.title}
                </Text>
                <button
                  onClick={() => remove(item.id)}
                  className="text-ui-fg-muted hover:text-ui-fg-base txt-small"
                  data-testid="remove-wishlist-item"
                >
                  Remove
                </button>
              </div>
            </li>
          ) : null
        )}
      </ul>
    </div>
  )
}

export default Wishlist
