"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Button, Text } from "@medusajs/ui"

import { useIntersection } from "@lib/hooks/use-in-view"
import Spinner from "@modules/common/icons/spinner"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { loadMoreProducts } from "./load-more-products"

const InfiniteProductGrid = ({
  initialItems,
  initialPage,
  initialTotalPages,
  sortBy,
  collectionId,
  categoryId,
  productsIds,
  countryCode,
}: {
  initialItems: React.ReactNode[]
  initialPage: number
  initialTotalPages: number
  sortBy?: SortOptions
  collectionId?: string
  categoryId?: string
  productsIds?: string[]
  countryCode: string
}) => {
  const [items, setItems] = useState(initialItems)
  const [loadedPage, setLoadedPage] = useState(initialPage)
  const [totalPages, setTotalPages] = useState(initialTotalPages)
  const [error, setError] = useState(false)
  const [isPending, startTransition] = useTransition()

  const sentinelRef = useRef<HTMLDivElement>(null)
  const isSentinelVisible = useIntersection(sentinelRef, "200px")

  const hasMore = loadedPage < totalPages

  const loadNext = useCallback(() => {
    setError(false)
    startTransition(async () => {
      const result = await loadMoreProducts({
        page: loadedPage + 1,
        sortBy,
        collectionId,
        categoryId,
        productsIds,
        countryCode,
      })

      if ("error" in result) {
        setError(true)
        return
      }

      setItems((prev) => [...prev, ...result.items])
      setLoadedPage((page) => page + 1)
      setTotalPages(result.totalPages)
    })
  }, [loadedPage, sortBy, collectionId, categoryId, productsIds, countryCode])

  // Fetch as soon as the sentinel is close to on-screen (see the 200px
  // rootMargin) — guarded on isPending/error so a re-intersection while a
  // fetch is already in flight, or after a failure, doesn't refire until
  // the shopper explicitly retries.
  useEffect(() => {
    if (isSentinelVisible && hasMore && !isPending && !error) {
      loadNext()
    }
  }, [isSentinelVisible, hasMore, isPending, error, loadNext])

  return (
    <>
      <ul
        className="grid grid-cols-2 w-full small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8"
        data-testid="products-list"
      >
        {items}
      </ul>
      {hasMore && !error && (
        <div
          ref={sentinelRef}
          className="h-px w-full"
          data-testid="infinite-scroll-sentinel"
        />
      )}
      {isPending && (
        <div className="flex justify-center py-8" data-testid="infinite-scroll-loading">
          <Spinner />
        </div>
      )}
      {error && (
        <div className="flex flex-col items-center gap-y-2 py-8">
          <Text className="text-ui-fg-subtle">Couldn't load more products.</Text>
          <Button
            variant="secondary"
            onClick={loadNext}
            data-testid="infinite-scroll-retry"
          >
            Retry
          </Button>
        </div>
      )}
    </>
  )
}

export default InfiniteProductGrid
