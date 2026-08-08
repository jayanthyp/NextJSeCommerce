import "server-only"
import { cookies as nextCookies } from "next/headers"

export const getAuthHeaders = async (): Promise<
  { authorization: string } | {}
> => {
  try {
    const cookies = await nextCookies()
    const token = cookies.get("_medusa_jwt")?.value

    if (!token) {
      return {}
    }

    return { authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

export const getCacheTag = async (tag: string): Promise<string> => {
  try {
    const cookies = await nextCookies()
    const cacheId = cookies.get("_medusa_cache_id")?.value

    if (!cacheId) {
      return ""
    }

    return `${tag}-${cacheId}`
  } catch (error) {
    return ""
  }
}

export const getCacheOptions = async (
  tag: string
): Promise<{ tags: string[] } | {}> => {
  if (typeof window !== "undefined") {
    return {}
  }

  const cacheTag = await getCacheTag(tag)

  if (!cacheTag) {
    return {}
  }

  return { tags: [`${cacheTag}`] }
}

export const setAuthToken = async (token: string) => {
  const cookies = await nextCookies()
  cookies.set("_medusa_jwt", token, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    // "strict" here dropped the cookie on the *next* request after
    // Google's OAuth redirect: some browsers still treat the immediate
    // same-origin follow-up redirect (our own /auth/callback/google ->
    // /account) as part of the cross-site navigation chain that started
    // at Google, so a Strict cookie set mid-chain isn't sent on it —
    // landing on /account looking signed-out despite the token having
    // been set correctly. "lax" is the standard choice for an auth
    // session cookie for exactly this reason (still blocks cross-site
    // POST-based CSRF, just allows top-level GET navigations).
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeAuthToken = async () => {
  const cookies = await nextCookies()
  cookies.set("_medusa_jwt", "", {
    maxAge: -1,
  })
}

export const getCartId = async () => {
  const cookies = await nextCookies()
  return cookies.get("_medusa_cart_id")?.value
}

export const setCartId = async (cartId: string) => {
  const cookies = await nextCookies()
  cookies.set("_medusa_cart_id", cartId, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeCartId = async () => {
  const cookies = await nextCookies()
  cookies.set("_medusa_cart_id", "", {
    maxAge: -1,
  })
}

// Google's OAuth redirect only ever lands at one fixed, unprefixed URL
// (/auth/callback/google — see loginWithOAuth's own comment on why), so
// the region the visitor was actually browsing in has nowhere to travel
// through that round trip on its own. Stashed here right before the
// redirect to Google, read back (and cleared) once on the way back, so
// e.g. an Australian visitor lands back on /au/account instead of
// whatever NEXT_PUBLIC_DEFAULT_REGION happens to be.
const OAUTH_RETURN_REGION_COOKIE = "_medusa_oauth_return_region"

export const setOAuthReturnRegion = async (countryCode: string) => {
  const cookies = await nextCookies()
  cookies.set(OAUTH_RETURN_REGION_COOKIE, countryCode, {
    maxAge: 60 * 10,
    httpOnly: true,
    // Same reasoning as _medusa_jwt above — this cookie is set right
    // before redirecting to Google and has to survive the return trip.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

export const consumeOAuthReturnRegion = async (): Promise<
  string | undefined
> => {
  const cookies = await nextCookies()
  const value = cookies.get(OAUTH_RETURN_REGION_COOKIE)?.value
  if (value) {
    cookies.set(OAUTH_RETURN_REGION_COOKIE, "", { maxAge: -1 })
  }
  return value
}

export type ThemePreference = "light" | "dark" | "system"

export const getTheme = async (): Promise<ThemePreference> => {
  const cookies = await nextCookies()
  const value = cookies.get("_medusa_theme")?.value
  return value === "light" || value === "dark" ? value : "system"
}

export const setThemeCookie = async (theme: ThemePreference) => {
  const cookies = await nextCookies()
  cookies.set("_medusa_theme", theme, {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}
