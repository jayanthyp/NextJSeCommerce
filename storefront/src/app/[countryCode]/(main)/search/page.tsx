import { Metadata } from "next"

import SearchResults from "@modules/search/templates/search-results"
import { searchEnabled } from "@lib/search/client"
import { SITE_NAME } from "@lib/constants"

export const metadata: Metadata = {
  title: `Search | ${SITE_NAME}`,
}

type Props = {
  searchParams: Promise<{ q?: string }>
}

export default async function SearchPage(props: Props) {
  const { q } = await props.searchParams
  const query = q ?? ""

  return (
    <div className="content-container py-12">
      <h1 className="text-2xl-semi mb-8" data-testid="search-page-title">
        {query ? `Search results for "${query}"` : "Search"}
      </h1>
      {searchEnabled ? (
        <SearchResults initialQuery={query} />
      ) : (
        <p className="text-ui-fg-subtle">Search is not currently available.</p>
      )}
    </div>
  )
}
