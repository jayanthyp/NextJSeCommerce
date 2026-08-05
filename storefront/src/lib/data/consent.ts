"use server"

import { cookies as nextCookies } from "next/headers"

export type ConsentState = "granted" | "denied" | "unset"

export const getConsent = async (): Promise<ConsentState> => {
  const cookies = await nextCookies()
  const value = cookies.get("_medusa_analytics_consent")?.value
  return value === "granted" || value === "denied" ? value : "unset"
}

export const setConsent = async (granted: boolean) => {
  const cookies = await nextCookies()
  cookies.set("_medusa_analytics_consent", granted ? "granted" : "denied", {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}
