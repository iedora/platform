// Public surface of the i18n slice. Internals (per-language folders,
// registry, types) are reachable from outside but consumers should prefer
// this barrel so the slice's contract stays stable.
//
// Server-only Zod schemas are imported from './server' explicitly
// (deliberate: keeping that surface separate so client code can't accidentally
// bundle it). UI lives at '@/features/i18n/ui/localized-fields' directly — no
// deep UI barrel.
export type { Language, LanguageCode, LanguageMeta, LocalizedText } from './types'
export {
  LANGUAGES,
  LANGUAGE_CODES,
  LANGUAGE_META,
  getLanguage,
  isLanguageCode,
} from './registry'
export { localized, localizedNullable, pickLanguage } from './format'

// The cookie the next-intl request config reads to pick the dashboard UI
// locale, and that `setUserLocale` writes. It lives here (the shared i18n
// slice barrel) rather than in a request.ts, so both the menu server action
// and apps/web's next-intl request config import it from one stable place —
// the request config was relocated to apps/web to merge menu + house catalogs.
export const DASHBOARD_LOCALE_COOKIE = 'NEXT_LOCALE'
