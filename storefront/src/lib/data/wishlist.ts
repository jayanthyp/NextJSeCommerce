"use server"

import { revalidateTag } from "next/cache"

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheOptions, getCacheTag } from "./cookies"

export type WishlistItem = {
  id: string
  customer_id: string
  product_id: string
  created_at: string
}

export const getWishlist = async (): Promise<WishlistItem[]> => {
  const headers = { ...(await getAuthHeaders()) }
  const next = { ...(await getCacheOptions("wishlist")) }

  return sdk.client
    .fetch<{ wishlist_items: WishlistItem[] }>(`/store/wishlists`, {
      method: "GET",
      headers,
      next,
      cache: "force-cache",
    })
    .then(({ wishlist_items }) => wishlist_items)
    .catch(() => [])
}

export const addToWishlist = async (productId: string) => {
  const headers = { ...(await getAuthHeaders()) }
  const result = await sdk.client.fetch(`/store/wishlists`, {
    method: "POST",
    headers,
    body: { product_id: productId },
  })
  revalidateTag(await getCacheTag("wishlist"))
  return result
}

export const removeFromWishlist = async (itemId: string) => {
  const headers = { ...(await getAuthHeaders()) }
  const result = await sdk.client.fetch(`/store/wishlists/${itemId}`, {
    method: "DELETE",
    headers,
  })
  revalidateTag(await getCacheTag("wishlist"))
  return result
}

export const getWishlistShareToken = async (): Promise<string | null> => {
  const headers = { ...(await getAuthHeaders()) }
  return sdk.client
    .fetch<{ share_token: string }>(`/store/wishlists/share`, {
      method: "GET",
      headers,
    })
    .then(({ share_token }) => share_token)
    .catch(() => null)
}

export const getSharedWishlist = async (token: string): Promise<string[]> => {
  return sdk.client
    .fetch<{ product_ids: string[] }>(`/store/wishlists/shared/${token}`, {
      method: "GET",
    })
    .then(({ product_ids }) => product_ids)
    .catch(() => [])
}
