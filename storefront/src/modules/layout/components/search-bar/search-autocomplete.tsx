"use client"

import { useEffect, useRef, useState } from "react"
import { InstantSearch, useHits, useSearchBox } from "react-instantsearch"
import { useRouter } from "next/navigation"
import { useParams } from "next/navigation"

import { getSearchClient, SEARCH_INDEX_NAME } from "@lib/search/client"
import SearchHit, { ProductHit } from "@modules/search/components/search-hit"

const AutocompleteResults = ({ query, onNavigate }: { query: string; onNavigate: () => void }) => {
  const { items } = useHits<ProductHit>()

  if (!query) {
    return null
  }

  if (!items.length) {
    return (
      <div className="p-4 text-ui-fg-subtle txt-compact-small">
        No products found for &quot;{query}&quot;
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-y-3 p-4">
      {items.slice(0, 6).map((hit) => (
        <div key={hit.id} onClick={onNavigate}>
          <SearchHit hit={hit} />
        </div>
      ))}
    </div>
  )
}

export const SearchInput = ({
  onSubmit,
  onNavigate,
}: {
  onSubmit: (query: string) => void
  onNavigate: () => void
}) => {
  const { refine } = useSearchBox()

  // Local state is the source of truth for the rendered value, decoupled from
  // useSearchBox's `query`: the @meilisearch/instant-meilisearch adapter does
  // not propagate refine() back into `query`, so a controlled `value={query}`
  // stays empty as the user types (issue #121 — "search field does not accept
  // text input"). refine() still drives the search + hits, and the same local
  // value gates the results below.
  const [inputValue, setInputValue] = useState("")

  return (
    <>
      <input
        type="search"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value)
          refine(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && inputValue) {
            onSubmit(inputValue)
          }
        }}
        placeholder="Search products..."
        className="w-full bg-transparent border-b border-ui-border-base focus:outline-none py-2 text-ui-fg-base"
        data-testid="search-input"
        autoFocus
      />
      <AutocompleteResults query={inputValue} onNavigate={onNavigate} />
    </>
  )
}

// Kept as a separate client component (not inline in SearchBar) so
// InstantSearch — and its underlying MeiliSearch client — is only
// constructed once the dropdown is actually opened, not on every page load.
export default function SearchAutocomplete({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { countryCode } = useParams()
  const containerRef = useRef<HTMLDivElement>(null)
  const [searchClient] = useState(() => getSearchClient())

  const goToResults = (query: string) => {
    router.push(`/${countryCode}/search?q=${encodeURIComponent(query)}`)
    onClose()
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  // Mobile search autocomplete dropdown positioning:
  // - fixed positioning relative to viewport on mobile devices (< 1024px)
  // - top-[72px] corresponds to the 64px header height (h-16) + 8px gap (mt-2 equivalent)
  // - left-4 right-4 stretches across screen with comfortable margins
  return (
    <div
      ref={containerRef}
      className="fixed top-[72px] left-4 right-4 w-auto small:absolute small:top-full small:right-0 small:left-auto small:mt-2 small:w-[360px] bg-white dark:bg-ui-bg-base border border-ui-border-base rounded-rounded shadow-lg z-[900]"
    >
      <InstantSearch searchClient={searchClient} indexName={SEARCH_INDEX_NAME}>
        <div className="px-4">
          <SearchInput onSubmit={goToResults} onNavigate={onClose} />
        </div>
      </InstantSearch>
    </div>
  )
}
