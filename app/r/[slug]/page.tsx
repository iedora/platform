import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { restaurant, type RestaurantTheme } from '@/lib/db/schema'
import { resolveTheme, type ResolvedTheme } from '@/components/menu/theme'
import {
  LANGUAGE_META,
  type LanguageCode,
  type LocalizedText,
  getLanguage,
  localizedNullable,
  pickLanguage,
} from '@/lib/i18n'
import { loadMenuTree, localizeTree } from '@/lib/menu/load-tree'
import { MenuRenderer } from '@/components/menu/menu-renderer'
import type { PublicMenuData } from '@/components/menu/types'

type LoadedRestaurant = PublicMenuData & {
  theme: ResolvedTheme
  defaultLanguage: LanguageCode
  supportedLanguages: LanguageCode[]
  currentLanguage: LanguageCode
}

async function loadPublishedRestaurant(
  slug: string,
  requestedLang: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Promise<LoadedRestaurant | null> {
  const restaurantRows = await db
    .select({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      description: restaurant.description,
      descriptionI18n: restaurant.descriptionI18n,
      logoUrl: restaurant.logoUrl,
      bannerUrl: restaurant.bannerUrl,
      theme: restaurant.theme,
      defaultLanguage: restaurant.defaultLanguage,
      supportedLanguages: restaurant.supportedLanguages,
      published: restaurant.published,
    })
    .from(restaurant)
    .where(eq(restaurant.slug, slug))
    .limit(1)

  const r = restaurantRows[0]
  if (!r || !r.published) return null

  const supported = r.supportedLanguages as LanguageCode[]
  const defaultLanguage = r.defaultLanguage as LanguageCode
  const currentLanguage = pickLanguage({
    requested: requestedLang,
    acceptLanguage,
    supported,
    defaultLanguage,
  })

  // Tree query lives in lib/menu — same loader the dashboard preview uses.
  // localizeTree reduces the i18n maps to the visitor's language.
  const tree = await loadMenuTree({ restaurantId: r.id, activeOnly: true })
  const menus = localizeTree(tree, currentLanguage, defaultLanguage)

  return {
    restaurant: {
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: localizedNullable(
        r.description,
        r.descriptionI18n as LocalizedText | null,
        currentLanguage,
        defaultLanguage,
      ),
      logoUrl: r.logoUrl,
      bannerUrl: r.bannerUrl,
    },
    menus,
    theme: resolveTheme(r.theme as RestaurantTheme | null),
    defaultLanguage,
    supportedLanguages: supported,
    currentLanguage,
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const sp = await searchParams
  const h = await headers()
  const data = await loadPublishedRestaurant(
    slug,
    sp.lang,
    h.get('accept-language'),
  )
  if (!data) return { title: 'Menu not found' }
  return {
    title: `${data.restaurant.name} · Menu`,
    description:
      data.restaurant.description ?? `Digital menu for ${data.restaurant.name}.`,
  }
}

export default async function PublicMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const h = await headers()
  const data = await loadPublishedRestaurant(
    slug,
    sp.lang,
    h.get('accept-language'),
  )
  if (!data) notFound()

  const showSwitcher = data.supportedLanguages.length > 1
  // Browsers honor the closest ancestor `lang` attribute for spell-check,
  // hyphenation, and screen readers. The root layout stays `lang="en"` for
  // the dashboard; here we override per-render based on the active language.
  const langMetaCurrent = getLanguage(data.currentLanguage)
  return (
    <div
      lang={data.currentLanguage}
      dir={langMetaCurrent?.dir ?? 'ltr'}
      data-testid="public-menu-root"
    >
      {showSwitcher && (
        <nav
          aria-label="Language"
          data-testid="language-switcher"
          className="flex justify-end gap-1 px-5 pt-4"
        >
          {data.supportedLanguages
            .map((code) => LANGUAGE_META.find((m) => m.code === code))
            .filter((m): m is (typeof LANGUAGE_META)[number] => Boolean(m))
            .map((langMeta) => {
              const isActive = langMeta.code === data.currentLanguage
              return (
                <a
                  key={langMeta.code}
                  href={`/r/${data.restaurant.slug}?lang=${langMeta.code}`}
                  hrefLang={langMeta.code}
                  data-testid={`lang-link-${langMeta.code}`}
                  aria-current={isActive ? 'true' : undefined}
                  className={
                    'rounded-full px-3 py-1 text-xs ' +
                    (isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted')
                  }
                >
                  {langMeta.nativeName}
                </a>
              )
            })}
        </nav>
      )}
      <MenuRenderer
        restaurant={data.restaurant}
        menus={data.menus}
        theme={data.theme}
      />
    </div>
  )
}
