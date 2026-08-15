"use client"

import { useEffect, useRef, useState } from "react"
import { InstantSearch, useHits, useSearchBox } from "react-instantsearch"
import { useRouter } from "next/navigation"
import { useParams } from "next/navigation"

import { getSearchClient, SEARCH_INDEX_NAME } from "@lib/search/client"
import SearchHit, { ProductHit } from "@modules/search/components/search-hit"

const AutocompleteResults = ({ onNavigate }: { onNavigate: () => void }) => {
  const { query } = useSearchBox()
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

const SearchInput = ({
  onSubmit,
  onNavigate,
}: {
  onSubmit: (query: string) => void
  onNavigate: () => void
}) => {
  const { query, refine } = useSearchBox()

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          refine(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query) {
            onSubmit(query)
          }
        }}
        placeholder="Search products..."
        className="w-full bg-transparent border-b border-ui-border-base focus:outline-none py-2 text-ui-fg-base"
        data-testid="search-input"
        autoFocus
      />
      <AutocompleteResults onNavigate={onNavigate} />
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

  return (
    <div
      ref={containerRef}
      className="absolute top-full right-0 mt-2 w-[360px] bg-white dark:bg-ui-bg-base border border-ui-border-base rounded-rounded shadow-lg z-[900]"
    >
      <InstantSearch searchClient={searchClient} indexName={SEARCH_INDEX_NAME}>
        <div className="px-4">
          <SearchInput onSubmit={goToResults} onNavigate={onClose} />
        </div>
      </InstantSearch>
    </div>
  )
}
