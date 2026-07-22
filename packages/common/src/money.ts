/** Options for {@link formatMoney}. */
export interface FormatMoneyOptions {
  /** ISO 4217 code, e.g. "EUR", "GBP". */
  currency: string
  /** BCP-47 locale; omit for the runtime/user-agent default. */
  locale?: string
}

// One Intl.NumberFormat per (locale, currency). Constructing a formatter resolves
// locale + currency data each time, and money is formatted on hot paths (every
// item row, every menu render), so cache and reuse.
const cache = new Map<string, Intl.NumberFormat>()

/**
 * Format an amount given in **minor units** (cents, pennies) as a localized
 * currency string. `formatMoney(1250, { currency: "EUR" })` → "€12.50" (or
 * "12,50 €" under a pt/fr locale). Assumes a 2-decimal currency.
 */
export function formatMoney(minorUnits: number, opts: FormatMoneyOptions): string {
  const key = `${opts.locale ?? ""}:${opts.currency}`
  let fmt = cache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(opts.locale, { style: "currency", currency: opts.currency })
    cache.set(key, fmt)
  }
  return fmt.format(minorUnits / 100)
}
