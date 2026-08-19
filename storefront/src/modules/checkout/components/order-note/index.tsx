"use client"

import { updateCartMetadata } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { useState } from "react"

const MAX_LENGTH = 500

export default function OrderNote({ cart }: { cart: HttpTypes.StoreCart }) {
  const [note, setNote] = useState(
    (cart.metadata?.order_note as string | undefined) ?? ""
  )
  const [saving, setSaving] = useState(false)

  const handleBlur = async () => {
    setSaving(true)
    try {
      await updateCartMetadata(cart.id, { order_note: note })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-2">
      <label
        htmlFor="order-note"
        className="text-base-semi text-ui-fg-base"
      >
        Order note (optional)
      </label>
      <textarea
        id="order-note"
        name="order_note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={handleBlur}
        maxLength={MAX_LENGTH}
        rows={4}
        placeholder="Add a gift note or delivery instruction"
        className="w-full border border-ui-border-base rounded-md px-3 py-2 text-small-regular text-ui-fg-base focus:outline-none focus:ring-1 focus:ring-ui-fg-interactive"
      />
      <div className="flex justify-between items-center">
        <span className="text-small-regular text-ui-fg-muted">
          {saving ? "Saving…" : "Saved automatically"}
        </span>
        <span className="text-small-regular text-ui-fg-muted">
          {note.length}/{MAX_LENGTH}
        </span>
      </div>
    </div>
  )
}
