import { Metadata } from "next"

import Carousel from "@modules/home/components/carousel"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import StoreTemplate from "@modules/store/templates"
import { SITE_NAME } from "@lib/constants"

export const metadata: Metadata = {
  title: SITE_NAME,
  description: `Explore all of our products at ${SITE_NAME}.`,
}

type Params = {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{
    sortBy?: SortOptions
    page?: string
  }>
}

// The landing page IS the store: rather than duplicate StoreTemplate's
// product-grid rendering, this route renders the same component /store
// renders, just with a carousel above it — a single source of truth for
// "what does the product listing look like" (see store/page.tsx).
export default async function Home(props: Params) {
  const { countryCode } = await props.params
  const { sortBy, page } = await props.searchParams

  return (
    <>
      <Carousel />
      <StoreTemplate sortBy={sortBy} page={page} countryCode={countryCode} />
    </>
  )
}
