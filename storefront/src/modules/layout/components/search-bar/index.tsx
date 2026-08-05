"use client"

import { useState } from "react"
import dynamic from "next/dynamic"

import SearchIcon from "@modules/common/icons/search"
import { searchEnabled } from "@lib/search/client"

// Loaded on demand — pulls in react-instantsearch + the MeiliSearch client,
// no reason to ship that in the initial page bundle for visitors who never
// open search.
const SearchAutocomplete = dynamic(() => import("./search-autocomplete"), {
  ssr: false,
})

const SearchBar = () => {
  const [open, setOpen] = useState(false)

  if (!searchEnabled) {
    return null
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:text-ui-fg-base flex items-center"
        aria-label="Search"
        data-testid="search-toggle-button"
      >
        <SearchIcon size={20} />
      </button>
      {open && <SearchAutocomplete onClose={() => setOpen(false)} />}
    </div>
  )
}

export default SearchBar
