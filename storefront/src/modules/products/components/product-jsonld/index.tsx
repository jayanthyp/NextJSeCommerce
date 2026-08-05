import { HttpTypes } from "@medusajs/types"

import { getBaseURL } from "@lib/util/env"
import { getProductPrice } from "@lib/util/get-product-price"

// schema.org/Product structured data — feeds Google's rich results (price,
// availability, review stars once reviews ship). Rendered server-side, no
// client JS involved.
export default function ProductJsonLd({
  product,
  countryCode,
}: {
  product: HttpTypes.StoreProduct
  countryCode: string
}) {
  const { cheapestPrice } = getProductPrice({ product })

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description || product.subtitle || product.title,
    image: (product.images ?? []).map((i) => i.url),
    sku: product.variants?.[0]?.sku ?? undefined,
    url: `${getBaseURL()}/${countryCode}/products/${product.handle}`,
  }

  if (cheapestPrice) {
    jsonLd.offers = {
      "@type": "Offer",
      price: (cheapestPrice.calculated_price_number ?? 0).toFixed(2),
      priceCurrency: cheapestPrice.currency_code?.toUpperCase(),
      availability: "https://schema.org/InStock",
      url: `${getBaseURL()}/${countryCode}/products/${product.handle}`,
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
