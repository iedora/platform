import { clamp } from "@iedora/common"
import { cn } from "@iedora/ui/lib/utils"
import { Star } from "lucide-react"

/**
 * Five stars, filled to `value`. Rendered as one shape clipped by a width —
 * so 4.6 shows six-tenths of the fifth star instead of rounding the truth away.
 */
export function Stars({
  value,
  className,
  size = "size-4",
}: {
  value: number
  className?: string
  size?: string
}) {
  const pct = clamp((value / 5) * 100, 0, 100)
  const row = (filled: boolean) => (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(size, filled ? "fill-rating text-rating" : "text-muted-foreground/30")}
        />
      ))}
    </span>
  )
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      role="img"
      aria-label={`${value.toFixed(1)} out of 5`}
    >
      {row(false)}
      <span
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${pct}%` }}
        aria-hidden
      >
        {row(true)}
      </span>
    </span>
  )
}
