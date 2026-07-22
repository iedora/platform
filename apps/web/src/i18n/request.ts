import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import {
  LANGUAGE_CODES,
  type LanguageCode,
  DASHBOARD_LOCALE_COOKIE,
} from '@iedora/product-menu/features/i18n'

// Menu's message catalogs (UI strings for the dashboard).
import menuEn from '@iedora/product-menu/i18n/messages/en.json'
import menuPt from '@iedora/product-menu/i18n/messages/pt.json'
import menuFr from '@iedora/product-menu/i18n/messages/fr.json'
// House's message catalogs (the marketing surface). House only ships the
// languages it has copy for (en + pt); other locales fall back to English.
import houseEn from '@iedora/product-house/i18n/messages/en.json'
import housePt from '@iedora/product-house/i18n/messages/pt.json'

// next-intl is the *UI strings* layer for the admin dashboard AND the house
// marketing surface. This request config lives in apps/web (not in either
// product package) so it can MERGE both products' catalogs without one package
// depending on the other. Content i18n (menu item names, etc.) lives in the
// menu package's lib/i18n and is unrelated. We share the language registry
// though — partial catalogs deep-merge over English so a missing key in a
// non-English catalog transparently falls back to the English string instead
// of leaking the key path into the UI.
//
// Catalogs are loaded with STATIC imports (not template dynamic imports) so the
// bundler resolves every catalog across both packages at build time.
export { DASHBOARD_LOCALE_COOKIE }
const DEFAULT_LOCALE: LanguageCode = 'en'

type Messages = Record<string, unknown>

// Deep-merge: `partial` overrides `base` for any key it defines; nested
// objects merge recursively. Strings, numbers, booleans, null and arrays
// are atomic — no per-element merging. Catalogs are flat strings + nested
// namespaces of strings, so this is sufficient.
function mergeCatalogs(base: Messages, partial: Messages): Messages {
  const out: Messages = { ...base }
  for (const [key, value] of Object.entries(partial)) {
    const baseVal = base[key]
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseVal &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      out[key] = mergeCatalogs(baseVal as Messages, value as Messages)
    } else {
      out[key] = value
    }
  }
  return out
}

// Per-locale merged catalog = menu ⊕ house. House has no `fr` catalog, so `fr`
// carries only the menu strings (its House namespace falls back to English via
// the deep-merge over the English base below). Only locales with a catalog file
// appear here; every other registered locale reads the English base.
const CATALOGS: Partial<Record<LanguageCode, Messages>> = {
  en: mergeCatalogs(menuEn as Messages, houseEn as Messages),
  pt: mergeCatalogs(menuPt as Messages, housePt as Messages),
  fr: menuFr as Messages,
}

const BASE_CATALOG: Messages = CATALOGS[DEFAULT_LOCALE]!

function isLanguageCode(value: string | undefined): value is LanguageCode {
  return Boolean(value && (LANGUAGE_CODES as readonly string[]).includes(value))
}

// Pick the first registered language found in `Accept-Language`. Browsers send
// tags like "pt-PT,pt;q=0.9,en;q=0.5" — we strip the region (`pt-PT` → `pt`),
// preserve the priority order, and stop at the first match.
function negotiateFromAcceptLanguage(header: string | null): LanguageCode | null {
  if (!header) return null
  // `split` always yields at least one element, so the `[0]!` is safe.
  const tags = header
    .split(',')
    .map((t) => t.split(';')[0]!.trim().toLowerCase().split('-')[0]!)
  for (const tag of tags) {
    if (isLanguageCode(tag)) return tag
  }
  return null
}

export default getRequestConfig(async () => {
  // Cookie wins so a user who explicitly picked a language keeps it across
  // sessions even when their browser advertises something else. The header
  // is only used for first-time anonymous visitors with no cookie set yet.
  const store = await cookies()
  const fromCookie = store.get(DASHBOARD_LOCALE_COOKIE)?.value
  let locale: LanguageCode
  if (isLanguageCode(fromCookie)) {
    locale = fromCookie
  } else {
    const h = await headers()
    locale = negotiateFromAcceptLanguage(h.get('accept-language')) ?? DEFAULT_LOCALE
  }

  // Always use English as the base of truth — every key has an English string.
  // Then layer the locale's merged catalog on top. If the locale has no catalog
  // (or an incomplete one), every missing key reads from the English base.
  const localeCatalog = CATALOGS[locale]
  const messages: Messages =
    locale === DEFAULT_LOCALE || !localeCatalog
      ? BASE_CATALOG
      : mergeCatalogs(BASE_CATALOG, localeCatalog)

  return { locale, messages }
})
