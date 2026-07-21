// Public-menu price formatter — invoked once per item AND once per variant on
// the hottest read path (every category of every public menu). Constructing an
// Intl.NumberFormat resolves locale/currency data each time, so cache one
// formatter per currency: the locale is fixed ('en-IE'), so currency alone keys
// the cache and the output is identical.
const formatters = new Map<string, Intl.NumberFormat>()

export function formatPrice(cents: number, currency: string): string {
  let fmt = formatters.get(currency)
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency })
    formatters.set(currency, fmt)
  }
  return fmt.format(cents / 100)
}
