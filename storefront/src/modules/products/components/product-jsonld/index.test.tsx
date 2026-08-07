import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { HttpTypes } from "@medusajs/types"
import ProductJsonLd from "./index"

const baseProduct = {
  id: "prod_1",
  title: "T-Shirt",
  subtitle: "A comfortable shirt",
  description: "100% cotton t-shirt.",
  handle: "t-shirt",
  images: [{ url: "https://example.com/t-shirt.jpg" }],
  variants: [
    {
      id: "variant_1",
      sku: "TSHIRT-BLK",
      calculated_price: {
        calculated_amount: 25,
        currency_code: "usd",
        original_amount: 25,
        calculated_price: { price_list_type: "default" },
      },
    },
  ],
} as unknown as HttpTypes.StoreProduct

const renderJsonLd = (product: HttpTypes.StoreProduct) => {
  const { container } = render(
    <ProductJsonLd product={product} countryCode="us" />
  )
  const script = container.querySelector('script[type="application/ld+json"]')
  return script ? JSON.parse(script.innerHTML) : null
}

describe("ProductJsonLd", () => {
  it("renders valid schema.org/Product structured data with an offer", () => {
    const parsed = renderJsonLd(baseProduct)

    expect(parsed["@context"]).toBe("https://schema.org")
    expect(parsed["@type"]).toBe("Product")
    expect(parsed.name).toBe("T-Shirt")
    expect(parsed.image).toEqual(["https://example.com/t-shirt.jpg"])
    expect(parsed.sku).toBe("TSHIRT-BLK")
    expect(parsed.url).toBe("https://localhost:8000/us/products/t-shirt")
    expect(parsed.offers).toEqual({
      "@type": "Offer",
      price: "25.00",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://localhost:8000/us/products/t-shirt",
    })
  })

  it("falls back to subtitle/title for description and omits offers without a price", () => {
    const parsed = renderJsonLd({
      ...baseProduct,
      description: null,
      variants: [],
    } as unknown as HttpTypes.StoreProduct)

    expect(parsed.description).toBe("A comfortable shirt")
    expect(parsed.offers).toBeUndefined()
  })
})
