import { Metadata } from "next"

import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import StoreTemplate from "@modules/store/templates"
import { SITE_NAME } from "@lib/constants"

export const metadata: Metadata = {
  title: `Store | ${SITE_NAME}`,
  description: `Explore all of our products at ${SITE_NAME}.`,
}

type Params = {
  searchParams: Promise<{
    sortBy?: SortOptions
    page?: string
    category_id?: string
    minPrice?: string
    maxPrice?: string
  }>
  params: Promise<{
    countryCode: string
  }>
}

export default async function StorePage(props: Params) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { sortBy, page, category_id, minPrice, maxPrice } = searchParams

  const categoryIds = category_id ? category_id.split(",").filter(Boolean) : undefined
  const parsedMinPrice = minPrice !== undefined ? Number(minPrice) : undefined
  const parsedMaxPrice = maxPrice !== undefined ? Number(maxPrice) : undefined

  return (
    <StoreTemplate
      sortBy={sortBy}
      page={page}
      countryCode={params.countryCode}
      categoryIds={categoryIds}
      minPrice={Number.isNaN(parsedMinPrice) ? undefined : parsedMinPrice}
      maxPrice={Number.isNaN(parsedMaxPrice) ? undefined : parsedMaxPrice}
    />
  )
}
