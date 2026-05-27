import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '../../../shared/db/client'
import { restaurant, type RestaurantTheme } from '../../../shared/db/schema'
import type { LanguageCode, LocalizedText } from '../../i18n'

/**
 * Wide projection of a single restaurant used by the theme editor.
 * Returns null on missing row so the route layer can `notFound()` —
 * we don't want this slice making routing decisions.
 *
 * Caller must already be gated via `requireRestaurantBySlug`.
 */
export type ThemeEditorRestaurantRow = {
  id: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  theme: RestaurantTheme | null
  defaultLanguage: LanguageCode
  supportedLanguages: LanguageCode[]
  descriptionI18n: LocalizedText
}

export async function getThemeEditorData(
  restaurantId: string,
): Promise<ThemeEditorRestaurantRow | null> {
  const [row] = await db
    .select({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      description: restaurant.description,
      logoUrl: restaurant.logoUrl,
      bannerUrl: restaurant.bannerUrl,
      theme: restaurant.theme,
      defaultLanguage: restaurant.defaultLanguage,
      supportedLanguages: restaurant.supportedLanguages,
      descriptionI18n: restaurant.descriptionI18n,
    })
    .from(restaurant)
    .where(eq(restaurant.id, restaurantId))
    .limit(1)

  if (!row) return null
  return {
    ...row,
    defaultLanguage: row.defaultLanguage as LanguageCode,
    supportedLanguages: (row.supportedLanguages as LanguageCode[] | null) ?? [
      row.defaultLanguage as LanguageCode,
    ],
    descriptionI18n: (row.descriptionI18n as LocalizedText | null) ?? {},
  }
}
