"use client"

import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "guest_wishlist_product_ids"

const read = (): string[] => {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const write = (ids: string[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // localStorage unavailable (private browsing, quota) — silently skip,
    // this feature degrading isn't worth surfacing an error to the visitor.
  }
}

// Guest-only wishlist state, mirroring use-recently-viewed's localStorage
// pattern. Signed-in wishlisting is server-persisted (see @lib/data/wishlist)
// — this hook only covers the no-auth-gate guest path from the product grid.
export const useLocalWishlist = (productId: string) => {
  const [ids, setIds] = useState<string[]>([])

  useEffect(() => {
    setIds(read())
  }, [])

  const isWishlisted = ids.includes(productId)

  const toggle = useCallback(() => {
    setIds((current) => {
      const next = current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
      write(next)
      return next
    })
  }, [productId])

  return { isWishlisted, toggle }
}
