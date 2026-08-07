import { describe, expect, it, vi } from "vitest"

vi.mock("@lib/data/regions", () => ({
  listRegions: vi.fn(),
}))
vi.mock("@lib/data/products", () => ({
  listProducts: vi.fn(),
}))
vi.mock("@lib/data/categories", () => ({
  listCategories: vi.fn(),
}))
vi.mock("@lib/data/collections", () => ({
  listCollections: vi.fn(),
}))

import { listRegions } from "@lib/data/regions"
import { listProducts } from "@lib/data/products"
import { listCategories } from "@lib/data/categories"
import { listCollections } from "@lib/data/collections"
import sitemap from "./sitemap"

const mockedListRegions = vi.mocked(listRegions)
const mockedListProducts = vi.mocked(listProducts)
const mockedListCategories = vi.mocked(listCategories)
const mockedListCollections = vi.mocked(listCollections)

describe("sitemap", () => {
  it("returns just the base URL when no regions exist", async () => {
    mockedListRegions.mockResolvedValue([])

    const entries = await sitemap()

    expect(entries).toHaveLength(1)
    expect(entries[0].url).toBe("https://localhost:8000")
  })

  it("fans out home/store/product/category/collection URLs across every region's country codes", async () => {
    mockedListRegions.mockResolvedValue([
      { countries: [{ iso_2: "dk" }, { iso_2: "se" }] },
      { countries: [{ iso_2: "us" }] },
    ] as any)
    mockedListProducts.mockResolvedValue({
      response: {
        products: [{ handle: "t-shirt", updated_at: "2026-01-01T00:00:00Z" }],
      },
    } as any)
    mockedListCategories.mockResolvedValue([{ handle: "shirts" }] as any)
    mockedListCollections.mockResolvedValue({
      collections: [{ handle: "summer" }],
    } as any)

    const entries = await sitemap()
    const urls = entries.map((e) => e.url)

    for (const cc of ["dk", "se", "us"]) {
      expect(urls).toContain(`https://localhost:8000/${cc}`)
      expect(urls).toContain(`https://localhost:8000/${cc}/store`)
      expect(urls).toContain(`https://localhost:8000/${cc}/products/t-shirt`)
      expect(urls).toContain(`https://localhost:8000/${cc}/categories/shirts`)
      expect(urls).toContain(`https://localhost:8000/${cc}/collections/summer`)
    }
    // 5 entries per country code x 3 country codes
    expect(entries).toHaveLength(15)

    // listProducts/listCategories/listCollections are fetched once, not
    // once per country code.
    expect(mockedListProducts).toHaveBeenCalledTimes(1)
    expect(mockedListCategories).toHaveBeenCalledTimes(1)
    expect(mockedListCollections).toHaveBeenCalledTimes(1)
  })

  it("deduplicates repeated country codes across regions", async () => {
    mockedListRegions.mockResolvedValue([
      { countries: [{ iso_2: "dk" }] },
      { countries: [{ iso_2: "dk" }] },
    ] as any)
    mockedListProducts.mockResolvedValue({ response: { products: [] } } as any)
    mockedListCategories.mockResolvedValue([] as any)
    mockedListCollections.mockResolvedValue({ collections: [] } as any)

    const entries = await sitemap()
    const homeEntries = entries.filter((e) => e.url === "https://localhost:8000/dk")

    expect(homeEntries).toHaveLength(1)
  })
})
