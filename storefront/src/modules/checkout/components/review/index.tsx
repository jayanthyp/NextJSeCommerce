"use client"

import { useEffect, useRef, useState } from "react"
import { Heading, Text, Textarea, clx } from "@medusajs/ui"

import { updateCart } from "@lib/data/cart"
import PaymentButton from "../payment-button"
import { useSearchParams } from "next/navigation"

const ORDER_NOTE_MAX_LENGTH = 500

const Review = ({ cart }: { cart: any }) => {
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  const paidByGiftcard =
    cart?.gift_cards && cart?.gift_cards?.length > 0 && cart?.total === 0

  const previousStepsCompleted =
    cart.shipping_address &&
    cart.shipping_methods.length > 0 &&
    (cart.payment_collection || paidByGiftcard)

  const [note, setNote] = useState(
    (cart?.metadata?.order_note as string | undefined) || ""
  )
  const lastSavedNote = useRef(note)

  // Auto-save on pause, matching shipping-address's debounced-save pattern —
  // the note has to be persisted as cart metadata before placeOrder()
  // completes the cart, since metadata only carries over at that point.
  useEffect(() => {
    if (note === lastSavedNote.current) {
      return
    }

    const timeout = setTimeout(() => {
      lastSavedNote.current = note
      updateCart({ metadata: { ...cart?.metadata, order_note: note } })
    }, 500)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note])

  return (
    <div className="bg-white dark:bg-ui-bg-base">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none": !isOpen,
            }
          )}
        >
          Review
        </Heading>
      </div>
      {isOpen && previousStepsCompleted && (
        <>
          <div className="mb-6">
            <Text className="txt-medium-plus text-ui-fg-base mb-2">
              Order note (optional)
            </Text>
            <Textarea
              value={note}
              onChange={(e) =>
                setNote(e.target.value.slice(0, ORDER_NOTE_MAX_LENGTH))
              }
              maxLength={ORDER_NOTE_MAX_LENGTH}
              placeholder="Add a gift message or delivery instructions"
              data-testid="order-note-input"
            />
            <Text className="txt-small text-ui-fg-subtle mt-1">
              {note.length}/{ORDER_NOTE_MAX_LENGTH}
            </Text>
          </div>
          <div className="flex items-start gap-x-1 w-full mb-6">
            <div className="w-full">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                By clicking the Place Order button, you confirm that you have
                read, understand and accept our Terms of Use, Terms of Sale and
                Returns Policy and acknowledge that you have read Medusa
                Store&apos;s Privacy Policy.
              </Text>
            </div>
          </div>
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </>
      )}
    </div>
  )
}

export default Review
