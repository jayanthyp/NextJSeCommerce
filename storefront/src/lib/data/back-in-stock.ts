"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"

export type BackInStockRequest = {
  id: string
  customer_id: string
  variant_id: string
  product_id: string
  notified_at: string | null
  created_at: string
}

export const getBackInStockRequests = async (): Promise<
  BackInStockRequest[]
> => {
  const headers = { ...(await getAuthHeaders()) }
  return sdk.client
    .fetch<{ back_in_stock_requests: BackInStockRequest[] }>(
      `/store/back-in-stock-requests`,
      { method: "GET", headers }
    )
    .then(({ back_in_stock_requests }) => back_in_stock_requests)
    .catch(() => [])
}

export const requestBackInStockNotification = async (
  variantId: string,
  productId: string
) => {
  const headers = { ...(await getAuthHeaders()) }
  return sdk.client.fetch(`/store/back-in-stock-requests`, {
    method: "POST",
    headers,
    body: { variant_id: variantId, product_id: productId },
  })
}

export const cancelBackInStockNotification = async (requestId: string) => {
  const headers = { ...(await getAuthHeaders()) }
  return sdk.client.fetch(`/store/back-in-stock-requests/${requestId}`, {
    method: "DELETE",
    headers,
  })
}
