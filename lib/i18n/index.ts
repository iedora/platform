// Public surface of the i18n module. Internals (per-language folders,
// registry, types) are reachable from outside but consumers should prefer
// this barrel so the module's contract stays stable.
export type { Language, LanguageCode, LanguageMeta, LocalizedText } from './types'
export {
  LANGUAGES,
  LANGUAGE_CODES,
  LANGUAGE_META,
  getLanguage,
  isLanguageCode,
} from './registry'
export { localized, localizedNullable, pickLanguage } from './format'
