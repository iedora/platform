// Money as an integer number of MINOR units (cents, pennies) — never floats, so
// no rounding drift. Currency is a plain ISO-4217 string, not an enum, so the
// framework stays domain-agnostic (any product's currencies work). Everything is
// immutable; operations return new Money.

/** ISO-4217 currency code, e.g. "USD", "EUR", "GBP". */
export type Currency = string

export interface Money {
  /** Amount in the currency's MINOR units (e.g. cents), an integer. */
  readonly amount: number
  readonly currency: Currency
}

/** Construct Money from an integer minor-unit amount. Throws on a non-integer. */
export function money(amount: number, currency: Currency): Money {
  if (!Number.isInteger(amount)) {
    throw new RangeError(`money amount must be an integer number of minor units, got ${amount}`)
  }
  if (!currency) throw new RangeError("money requires a currency")
  return { amount, currency }
}

export function zero(currency: Currency): Money {
  return { amount: 0, currency }
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`currency mismatch: ${a.currency} vs ${b.currency}`)
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return { amount: a.amount + b.amount, currency: a.currency }
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return { amount: a.amount - b.amount, currency: a.currency }
}

/** Sum a list; needs a currency for the empty case. */
export function sum(items: Money[], currency: Currency): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency))
}

/**
 * Multiply by a scalar (e.g. a quantity or a tax/percentage factor) and round to
 * a whole minor unit. Rounding is half-up on the absolute value (symmetric for
 * negatives), the least-surprising default for prices and tax.
 */
export function multiply(m: Money, factor: number, round: Rounding = "half-up"): Money {
  return { amount: roundTo(m.amount * factor, round), currency: m.currency }
}

/** Take a percentage (rate in [0,1], e.g. 0.2 = 20%). Rounds like {@link multiply}. */
export function percentage(m: Money, rate: number, round: Rounding = "half-up"): Money {
  return multiply(m, rate, round)
}

export type Rounding = "half-up" | "half-even" | "down" | "up"

function roundTo(value: number, mode: Rounding): number {
  if (Number.isInteger(value)) return value
  const sign = value < 0 ? -1 : 1
  const abs = Math.abs(value)
  switch (mode) {
    case "down":
      return sign * Math.floor(abs)
    case "up":
      return sign * Math.ceil(abs)
    case "half-even": {
      const floor = Math.floor(abs)
      const frac = abs - floor
      if (frac < 0.5) return sign * floor
      if (frac > 0.5) return sign * (floor + 1)
      return sign * (floor % 2 === 0 ? floor : floor + 1) // ties to even
    }
    default: // half-up
      return sign * Math.floor(abs + 0.5)
  }
}

/**
 * Split Money into parts by integer weights, distributing every remaining minor
 * unit so the parts ALWAYS sum back to the original — no penny lost or invented.
 * Extra units go to the earliest parts (largest-remainder). This is how you split
 * a charge into a platform fee + a payout, or a total across line items.
 *
 * ```ts
 * allocate(money(1000, "USD"), [1, 1, 1]) // -> [334, 333, 333]
 * ```
 */
export function allocate(m: Money, weights: number[]): Money[] {
  if (weights.length === 0) throw new RangeError("allocate needs at least one weight")
  if (weights.some((w) => w < 0)) throw new RangeError("allocate weights must be non-negative")
  const total = weights.reduce((a, w) => a + w, 0)
  if (total === 0) throw new RangeError("allocate weights must not all be zero")

  const parts = weights.map((w) => Math.floor((m.amount * w) / total))
  let remainder = m.amount - parts.reduce((a, p) => a + p, 0)
  // Hand out the leftover units one at a time, largest weight first for stability.
  const order = weights.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w)
  for (let k = 0; remainder > 0; k = (k + 1) % order.length) {
    const idx = order[k]!.i
    parts[idx]! += 1
    remainder -= 1
  }
  return parts.map((amount) => ({ amount, currency: m.currency }))
}

export const isZero = (m: Money): boolean => m.amount === 0
export const isNegative = (m: Money): boolean => m.amount < 0
export const isPositive = (m: Money): boolean => m.amount > 0
export const negate = (m: Money): Money => ({ amount: -m.amount, currency: m.currency })

/** -1 | 0 | 1 (same-currency). */
export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b)
  return a.amount === b.amount ? 0 : a.amount < b.amount ? -1 : 1
}

export const equals = (a: Money, b: Money): boolean => a.currency === b.currency && a.amount === b.amount

/**
 * Format for display using the runtime's Intl. `minorPerMajor` is the currency's
 * scale (100 for most; pass 1 for zero-decimal currencies like JPY). Kept explicit
 * so the package needs no currency database.
 */
export function format(m: Money, opts: { locale?: string; minorPerMajor?: number } = {}): string {
  const scale = opts.minorPerMajor ?? 100
  return new Intl.NumberFormat(opts.locale, { style: "currency", currency: m.currency }).format(
    m.amount / scale,
  )
}
