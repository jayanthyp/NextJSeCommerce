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
