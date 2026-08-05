"use client"

import { useActionState, useState } from "react"
import { Button, Text, Textarea, Input } from "@medusajs/ui"

import { createReview, StoreReview } from "@lib/data/reviews"

const StarRating = ({
  rating,
  onChange,
}: {
  rating: number
  onChange?: (value: number) => void
}) => {
  return (
    <div className="flex gap-x-1">
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(value)}
          className={value <= rating ? "text-ui-fg-interactive" : "text-ui-fg-muted"}
          aria-label={`${value} star${value > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

const ReviewForm = ({ productId }: { productId: string }) => {
  const [rating, setRating] = useState(0)

  const submitReview = async (_prevState: unknown, formData: FormData) => {
    if (!rating) {
      return { success: false as const, message: "Please select a rating" }
    }

    const result = await createReview({
      product_id: productId,
      rating,
      title: (formData.get("title") as string) || undefined,
      content: formData.get("content") as string,
    })

    return result
  }

  const [state, formAction, isPending] = useActionState(submitReview, null)

  if (state?.success) {
    return (
      <Text className="text-ui-fg-subtle py-4">
        Thanks — your review has been submitted and will appear once approved.
      </Text>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-y-4 py-8 max-w-md">
      <div className="flex flex-col gap-y-2">
        <Text className="txt-small-plus">Your rating</Text>
        <StarRating rating={rating} onChange={setRating} />
      </div>
      <Input name="title" placeholder="Review title (optional)" />
      <Textarea name="content" placeholder="Share your thoughts about this product" required />
      {state && !state.success && (
        <Text className="text-ui-fg-error txt-small">{state.message}</Text>
      )}
      <Button type="submit" isLoading={isPending} className="w-fit">
        Submit review
      </Button>
    </form>
  )
}

const ReviewsTab = ({
  productId,
  reviews,
  isLoggedIn,
}: {
  productId: string
  reviews: StoreReview[]
  isLoggedIn: boolean
}) => {
  const average =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : null

  return (
    <div className="py-8" data-testid="reviews-tab">
      {average && (
        <div className="flex items-center gap-x-2 mb-6">
          <StarRating rating={Math.round(Number(average))} />
          <Text className="text-ui-fg-subtle">
            {average} out of 5 ({reviews.length} review{reviews.length === 1 ? "" : "s"})
          </Text>
        </div>
      )}

      <div className="flex flex-col gap-y-6 mb-8">
        {reviews.map((review) => (
          <div key={review.id} className="flex flex-col gap-y-1" data-testid="review-item">
            <div className="flex items-center gap-x-2">
              <StarRating rating={review.rating} />
              <Text className="txt-small-plus">{review.customer_name ?? "Anonymous"}</Text>
            </div>
            {review.title && <Text className="txt-medium-plus">{review.title}</Text>}
            <Text className="text-ui-fg-subtle">{review.content}</Text>
          </div>
        ))}
        {!reviews.length && (
          <Text className="text-ui-fg-subtle">No reviews yet — be the first.</Text>
        )}
      </div>

      {isLoggedIn ? (
        <ReviewForm productId={productId} />
      ) : (
        <Text className="text-ui-fg-subtle">
          Sign in to leave a review (only available for products you've purchased).
        </Text>
      )}
    </div>
  )
}

export default ReviewsTab
