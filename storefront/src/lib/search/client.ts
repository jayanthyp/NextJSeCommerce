import { instantMeiliSearch } from "@meilisearch/instant-meilisearch"

export const SEARCH_INDEX_NAME =
  process.env.NEXT_PUBLIC_SEARCH_INDEX_NAME || "products"

export const searchEnabled = Boolean(
  process.env.NEXT_PUBLIC_SEARCH_ENDPOINT && process.env.NEXT_PUBLIC_SEARCH_API_KEY
)

// instantMeiliSearch talks to MeiliSearch directly from the browser — the
// endpoint/key here must be the public Caddy-proxied URL and a search-ONLY
// scoped key, never the master/admin key (see .env.example). No-ops (throws
// on first use, never constructed) when unconfigured so local/CI
// environments without a MeiliSearch key don't crash.
export const getSearchClient = () => {
  if (!searchEnabled) {
    throw new Error("Search is not configured (NEXT_PUBLIC_SEARCH_ENDPOINT/API_KEY unset)")
  }

  const { searchClient } = instantMeiliSearch(
    process.env.NEXT_PUBLIC_SEARCH_ENDPOINT!,
    process.env.NEXT_PUBLIC_SEARCH_API_KEY!,
    {
      finitePagination: true,
    }
  )

  return searchClient
}
