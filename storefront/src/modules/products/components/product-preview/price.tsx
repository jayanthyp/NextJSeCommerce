import { Text, clx } from "@medusajs/ui"
import { VariantPrice } from "types/global"

export default async function PreviewPrice({ price }: { price: VariantPrice }) {
  if (!price) {
    return null
  }

  return (
    <>
      {price.price_type === "sale" && (
        <Text
          className="line-through text-ui-fg-muted"
          data-testid="original-price"
        >
          {price.original_price}
        </Text>
      )}
      <Text
        className={clx("text-ui-fg-muted", {
          "text-ui-fg-interactive": price.price_type === "sale",
        })}
        data-testid="price"
      >
        {price.calculated_price}
      </Text>
    </>
  )
}

// Renders no badge for a 0% (or missing) diff so we never show "-0%".
export function DiscountBadge({ price }: { price?: VariantPrice | null }) {
  if (!price || price.price_type !== "sale" || price.percentage_diff === "0") {
    return null
  }

  return (
    <Text
      className="bg-ui-bg-base text-ui-fg-interactive rounded-full px-2 py-0.5 text-xsmall-regular"
      data-testid="discount-badge"
    >
      -{price.percentage_diff}%
    </Text>
  )
}
