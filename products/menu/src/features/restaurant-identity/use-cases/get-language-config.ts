import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '../../../shared/db/client'
import { restaurant } from '../../../shared/db/schema'
import type { LanguageCode } from '../../i18n'

/**
 * Minimal `(defaultLanguage, supportedLanguages)` projection for one
 * restaurant. Used by the dashboard restaurant home to decide whether
 * the AI-translation CTA shows. Caller is expected to have already
 * verified org membership via `requireRestaurantBySlug` etc.
 */
export async function getLanguageConfig(restaurantId: string): Promise<{
  defaultLanguage: LanguageCode
  supportedLanguages: LanguageCode[]
}> {
  const [row] = await db
    .select({
      defaultLanguage: restaurant.defaultLanguage,
      supportedLanguages: restaurant.supportedLanguages,
    })
    .from(restaurant)
    .where(eq(restaurant.id, restaurantId))
    .limit(1)

  const defaultLanguage = (row?.defaultLanguage as LanguageCode | undefined) ?? 'en'
  const supportedLanguages =
    (row?.supportedLanguages as LanguageCode[] | null) ?? [defaultLanguage]

  return { defaultLanguage, supportedLanguages }
}
