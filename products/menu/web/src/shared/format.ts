import { formatMoney } from '@iedora/common'

/**
 * Locale-aware money formatting in the user-agent locale (no `locale` passed),
 * so `12.34 €` formats as `12,34 €` in pt-PT without callers plumbing locale.
 * Cached per currency in `@iedora/common`.
 */
export function formatPrice(priceCents: number, currency: string): string {
  return formatMoney(priceCents, { currency })
}

/**
 * Parse a user-typed price (comma OR dot decimal) into integer cents, or null
 * when it isn't a valid non-negative number. The inverse of {@link formatPrice};
 * shared by every price input (add-item, sortable-item, variants) so the
 * locale-decimal + cents-rounding rule lives in one place.
 */
export function parsePriceCents(text: string): number | null {
  const n = Number(text.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}
