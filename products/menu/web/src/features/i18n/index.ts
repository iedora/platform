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
