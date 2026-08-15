"use client"

import * as Slider from "@radix-ui/react-slider"
import { useEffect, useState } from "react"

import { convertToLocale } from "@lib/util/money"

type PriceRangeFilterProps = {
  bounds: { min: number; max: number }
  value: [number, number]
  currencyCode?: string
  onChange: (value: [number, number]) => void
}

// Dual-handle Radix slider -- bounds come from getPriceBounds() (derived
// from the region's actually-fetched products, see
// filter-products-by-price.ts), never hardcoded. `value` is controlled by
// the parent (URL search params), local `pending` state just makes
// dragging feel smooth instead of pushing a router update on every pixel.
const PriceRangeFilter = ({
  bounds,
  value,
  currencyCode,
  onChange,
}: PriceRangeFilterProps) => {
  const [pending, setPending] = useState<[number, number]>(value)

  useEffect(() => {
    setPending(value)
  }, [value[0], value[1]])

  const format = (amount: number) =>
    currencyCode
      ? convertToLocale({
          amount,
          currency_code: currencyCode,
          maximumFractionDigits: 0,
        })
      : amount.toString()

  if (bounds.min >= bounds.max) {
    return null
  }

  return (
    <div className="flex flex-col gap-y-3" data-testid="price-range-filter">
      <div className="flex items-center justify-between text-small-regular text-ui-fg-subtle">
        <span data-testid="price-range-min-label">{format(pending[0])}</span>
        <span data-testid="price-range-max-label">{format(pending[1])}</span>
      </div>
      <Slider.Root
        className="relative flex items-center select-none touch-none h-5 w-full"
        min={bounds.min}
        max={bounds.max}
        step={1}
        value={pending}
        minStepsBetweenThumbs={1}
        onValueChange={(next) => setPending([next[0], next[1]])}
        onValueCommit={(next) => onChange([next[0], next[1]])}
        data-testid="price-range-slider"
      >
        <Slider.Track className="bg-ui-bg-subtle relative grow rounded-full h-1">
          <Slider.Range className="absolute bg-ui-fg-base rounded-full h-full" />
        </Slider.Track>
        <Slider.Thumb
          className="block w-5 h-5 rounded-full bg-white dark:bg-ui-bg-base border border-ui-border-base shadow focus:outline-none focus:ring-2 focus:ring-ui-fg-interactive"
          aria-label="Minimum price"
        />
        <Slider.Thumb
          className="block w-5 h-5 rounded-full bg-white dark:bg-ui-bg-base border border-ui-border-base shadow focus:outline-none focus:ring-2 focus:ring-ui-fg-interactive"
          aria-label="Maximum price"
        />
      </Slider.Root>
    </div>
  )
}

export default PriceRangeFilter
