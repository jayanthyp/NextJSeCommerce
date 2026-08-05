"use server"

import { sdk } from "@lib/config"
import { getCacheOptions } from "./cookies"

export type StorePage = {
  id: string
  title: string
  slug: string
  content: string
  footer_section: "support" | "policies" | null
  rank: number
  is_active: boolean
}

export const getPageBySlug = async (slug: string): Promise<StorePage | null> => {
  const next = {
    ...(await getCacheOptions("pages")),
  }

  return sdk.client
    .fetch<{ page: StorePage }>(`/store/pages/${slug}`, {
      method: "GET",
      next,
      cache: "force-cache",
    })
    .then(({ page }) => page)
    .catch(() => null)
}

export const listFooterPages = async (): Promise<{
  support: StorePage[]
  policies: StorePage[]
}> => {
  const next = {
    ...(await getCacheOptions("pages")),
  }

  return sdk.client
    .fetch<{ pages: StorePage[] }>(`/store/pages`, {
      method: "GET",
      next,
      cache: "force-cache",
    })
    .then(({ pages }) => ({
      support: pages.filter((p) => p.footer_section === "support"),
      policies: pages.filter((p) => p.footer_section === "policies"),
    }))
    // The footer renders on every page — a CMS fetch failure (e.g. before
    // the backend has been migrated/deployed) should silently omit the
    // Support/Policies columns, never break the whole site's layout.
    .catch(() => ({ support: [], policies: [] }))
}
