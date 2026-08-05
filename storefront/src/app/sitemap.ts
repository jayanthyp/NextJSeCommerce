import { MetadataRoute } from "next"

import { getBaseURL } from "@lib/util/env"
import { listRegions } from "@lib/data/regions"
import { listProducts } from "@lib/data/products"
import { listCategories } from "@lib/data/categories"
import { listCollections } from "@lib/data/collections"

// Next.js prerenders sitemap.ts at build time by default, which fetches
// from the Medusa backend — but a plain `docker build` runs in an isolated
// network namespace with no route to a running backend container (same
// reason generateStaticParams was removed from the product/category/
// collection pages elsewhere in this project). force-dynamic makes this
// render per-request instead, against the live backend.
export const dynamic = "force-dynamic"

// Next.js caps a single sitemap at 50,000 URLs. At 16 regions this catalog
// would need 3,000+ products to approach that — revisit with a sitemap
// index (multiple sitemap.xml files) if the catalog grows that large.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseURL()
  const regions = await listRegions()
  const countryCodes = Array.from(
    new Set(
      (regions ?? []).flatMap(
        (region) => region.countries?.map((c) => c.iso_2).filter(Boolean) ?? []
      )
    )
  ) as string[]

  if (!countryCodes.length) {
    return [{ url: baseUrl, lastModified: new Date() }]
  }

  // Product/category/collection handles don't vary by region — fetch once
  // against the first country code, then fan out per region below.
  const [productsResult, categories, { collections }] = await Promise.all([
    listProducts({
      countryCode: countryCodes[0],
      queryParams: { limit: 1000, fields: "handle,updated_at" },
    }),
    listCategories({ limit: 1000 }),
    listCollections({ limit: 1000 }),
  ])

  const productHandles = productsResult.response.products.map((p) => ({
    handle: p.handle,
    updatedAt: p.updated_at ? new Date(p.updated_at) : new Date(),
  }))
  const categoryHandles = categories.map((c) => c.handle)
  const collectionHandles = collections.map((c) => c.handle)

  const entries: MetadataRoute.Sitemap = []

  for (const countryCode of countryCodes) {
    entries.push({
      url: `${baseUrl}/${countryCode}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    })
    entries.push({
      url: `${baseUrl}/${countryCode}/store`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    })

    for (const { handle, updatedAt } of productHandles) {
      entries.push({
        url: `${baseUrl}/${countryCode}/products/${handle}`,
        lastModified: updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      })
    }

    for (const handle of categoryHandles) {
      entries.push({
        url: `${baseUrl}/${countryCode}/categories/${handle}`,
        changeFrequency: "weekly",
        priority: 0.6,
      })
    }

    for (const handle of collectionHandles) {
      entries.push({
        url: `${baseUrl}/${countryCode}/collections/${handle}`,
        changeFrequency: "weekly",
        priority: 0.6,
      })
    }
  }

  return entries
}
