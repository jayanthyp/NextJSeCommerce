"use client"

import { useEffect, useState } from "react"
import { Button, Text } from "@medusajs/ui"

import { retrieveCustomer } from "@lib/data/customer"
import {
  getBackInStockRequests,
  requestBackInStockNotification,
} from "@lib/data/back-in-stock"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Shown in place of "Add to cart" for an out-of-stock variant. Self-contained
// (checks its own auth state) rather than threading isLoggedIn down through
// ProductActions, matching the wishlist-button pattern.
const NotifyMeButton = ({
  variantId,
  productId,
}: {
  variantId: string
  productId: string
}) => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [requested, setRequested] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    retrieveCustomer().then((customer) => {
      setIsLoggedIn(!!customer)
      if (!customer) return
      getBackInStockRequests().then((requests) => {
        setRequested(requests.some((r) => r.variant_id === variantId))
      })
    })
  }, [variantId])

  if (isLoggedIn === null) {
    return (
      <Button className="w-full h-10" variant="secondary" disabled isLoading>
        Notify me
      </Button>
    )
  }

  if (!isLoggedIn) {
    return (
      <LocalizedClientLink href="/account" className="block">
        <Button className="w-full h-10" variant="secondary">
          Sign in to get notified
        </Button>
      </LocalizedClientLink>
    )
  }

  if (requested) {
    return (
      <Text
        className="text-ui-fg-subtle text-center txt-small"
        data-testid="notify-me-confirmed"
      >
        We&apos;ll email you when it&apos;s back in stock.
      </Text>
    )
  }

  const handleClick = async () => {
    setLoading(true)
    await requestBackInStockNotification(variantId, productId)
    setRequested(true)
    setLoading(false)
  }

  return (
    <Button
      className="w-full h-10"
      variant="secondary"
      onClick={handleClick}
      isLoading={loading}
      data-testid="notify-me-button"
    >
      Notify me when available
    </Button>
  )
}

export default NotifyMeButton
