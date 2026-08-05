"use client"

import { useEffect, useState } from "react"

const STORAGE_KEY = "recently_viewed_products"
const MAX_ITEMS = 12

type RecentlyViewedEntry = { id: string; handle: string }

const read = (): RecentlyViewedEntry[] => {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const write = (entries: RecentlyViewedEntry[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage unavailable (private browsing, quota) — silently skip,
    // this feature degrading isn't worth surfacing an error to the visitor.
  }
}

// Records a product view (call once on product-page mount) and separately
// exposes the current list for display elsewhere (e.g. the homepage).
// Deliberately client-side/localStorage only, not a backend module: unlike
// wishlist/reviews this has no reason to be account-scoped or admin-visible,
// and it's inherently per-browser by nature.
export const recordProductView = (entry: RecentlyViewedEntry) => {
  const existing = read().filter((e) => e.id !== entry.id)
  write([entry, ...existing].slice(0, MAX_ITEMS))
}

export const useRecentlyViewed = (excludeId?: string): RecentlyViewedEntry[] => {
  const [entries, setEntries] = useState<RecentlyViewedEntry[]>([])

  useEffect(() => {
    setEntries(read().filter((e) => e.id !== excludeId))
  }, [excludeId])

  return entries
}
