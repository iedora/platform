import { formatMoney } from '@iedora/common'

// Public-menu price formatter — invoked once per item AND once per variant on the
// hottest read path. The locale is fixed ('en-IE') so the public menu renders the
// same regardless of the viewer; cached per currency in `@iedora/common`.
export function formatPrice(cents: number, currency: string): string {
  return formatMoney(cents, { currency, locale: 'en-IE' })
}
