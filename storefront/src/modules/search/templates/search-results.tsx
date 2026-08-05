"use client"

import { useState } from "react"
import { InstantSearch, useHits, useSearchBox, usePagination } from "react-instantsearch"

import { getSearchClient, SEARCH_INDEX_NAME } from "@lib/search/client"
import SearchHit, { ProductHit } from "@modules/search/components/search-hit"

const ResultsGrid = () => {
  const { query } = useSearchBox()
  const { items } = useHits<ProductHit>()
  const { currentRefinement, nbPages, refine } = usePagination()

  if (!items.length) {
    return (
      <p className="text-ui-fg-subtle" data-testid="no-results">
        No products found for &quot;{query}&quot;.
      </p>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8">
        {items.map((hit) => (
          <SearchHit key={hit.id} hit={hit} />
        ))}
      </div>
      {nbPages > 1 && (
        <div className="flex gap-x-2 justify-center mt-12">
          {Array.from({ length: nbPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => refine(i)}
              className={`w-8 h-8 rounded-rounded ${
                i === currentRefinement
                  ? "bg-ui-bg-interactive text-white"
                  : "hover:bg-ui-bg-subtle"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export default function SearchResults({ initialQuery }: { initialQuery: string }) {
  const [searchClient] = useState(() => getSearchClient())

  return (
    <InstantSearch
      searchClient={searchClient}
      indexName={SEARCH_INDEX_NAME}
      initialUiState={{
        [SEARCH_INDEX_NAME]: { query: initialQuery },
      }}
    >
      <ResultsGrid />
    </InstantSearch>
  )
}
