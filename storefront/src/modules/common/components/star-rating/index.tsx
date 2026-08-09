"use client"

// Read-only when onChange is omitted (disabled={!onChange}) — shared by the
// PDP's review form/summary and the catalog grid's compact rating row.
// Renders plain-text ★ glyphs, so callers that need a smaller size wrap
// this in a container with a smaller font-size (e.g. text-xs) rather than
// this component taking its own size prop.
const StarRating = ({
  rating,
  onChange,
}: {
  rating: number
  onChange?: (value: number) => void
}) => {
  return (
    <div className="flex gap-x-1">
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(value)}
          className={value <= rating ? "text-ui-fg-interactive" : "text-ui-fg-muted"}
          aria-label={`${value} star${value > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default StarRating
