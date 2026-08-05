import Image from "next/image"
import { Text } from "@medusajs/ui"

import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Matches the `fields`/`displayedAttributes` configured for the "products"
// index in medusa/medusa-config.ts's meilisearch plugin settings — this is
// deliberately a smaller shape than HttpTypes.StoreProduct (no live
// pricing/variants; the index isn't the source of truth for those).
export type ProductHit = {
  id: string
  title: string
  description?: string | null
  handle: string
  thumbnail?: string | null
}

const SearchHit = ({ hit }: { hit: ProductHit }) => {
  return (
    <LocalizedClientLink
      href={`/products/${hit.handle}`}
      className="flex items-center gap-x-3 group"
      data-testid="search-hit"
    >
      <div className="w-12 h-12 shrink-0 bg-ui-bg-subtle rounded-rounded overflow-hidden relative">
        {hit.thumbnail && (
          <Image
            src={hit.thumbnail}
            alt={hit.title}
            fill
            sizes="48px"
            className="object-cover"
          />
        )}
      </div>
      <Text className="txt-compact-medium text-ui-fg-base group-hover:text-ui-fg-subtle">
        {hit.title}
      </Text>
    </LocalizedClientLink>
  )
}

export default SearchHit
