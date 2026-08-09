"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheOptions } from "./cookies"

export type StoreReview = {
  id: string
  product_id: string
  customer_name: string | null
  rating: number
  title: string | null
  content: string
  status: "pending" | "approved" | "rejected"
  created_at: string
}

export const listProductReviews = async (productId: string): Promise<StoreReview[]> => {
  const next = {
    ...(await getCacheOptions(`reviews-${productId}`)),
  }

  return sdk.client
    .fetch<{ reviews: StoreReview[] }>(`/store/reviews`, {
      method: "GET",
      query: { product_id: productId },
      next,
      cache: "force-cache",
    })
    .then(({ reviews }) => reviews)
    .catch(() => [])
}

export type ReviewSummary = { average: number; count: number }

// Batch counterpart to listProductReviews, for grid contexts (a product
// catalog page) where fetching each card's reviews individually would be
// an N+1 request per page load — one call for the whole page instead.
export const listProductReviewSummaries = async (
  productIds: string[]
): Promise<Record<string, ReviewSummary>> => {
  if (!productIds.length) {
    return {}
  }

  const next = {
    ...(await getCacheOptions(`reviews-summary-${productIds.join(",")}`)),
  }

  return sdk.client
    .fetch<{ summaries: Record<string, ReviewSummary> }>(
      `/store/reviews/summary`,
      {
        method: "GET",
        query: { product_id: productIds },
        next,
        cache: "force-cache",
      }
    )
    .then(({ summaries }) => summaries)
    .catch(() => ({}))
}

export type CreateReviewInput = {
  product_id: string
  rating: number
  title?: string
  content: string
}

export const createReview = async (
  input: CreateReviewInput
): Promise<{ success: true } | { success: false; message: string }> => {
  const headers = { ...(await getAuthHeaders()) }

  try {
    await sdk.client.fetch(`/store/reviews`, {
      method: "POST",
      headers,
      body: input,
    })
    return { success: true }
  } catch (e: any) {
    return {
      success: false,
      message: e?.message || "Failed to submit review",
    }
  }
}
