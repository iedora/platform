import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { category, item, menu, restaurant } from '@/lib/db/schema'

type PublicRestaurant = {
  id: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
}

type PublicMenu = {
  id: string
  name: string
  description: string | null
  categories: PublicCategory[]
}

type PublicCategory = {
  id: string
  name: string
  description: string | null
  items: PublicItem[]
}

type PublicItem = {
  id: string
  name: string
  description: string | null
  priceCents: number
  currency: string
  available: boolean
  tags: string[]
}

async function loadPublishedRestaurant(slug: string): Promise<{
  restaurant: PublicRestaurant
  menus: PublicMenu[]
} | null> {
  const restaurantRows = await db
    .select({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      description: restaurant.description,
      logoUrl: restaurant.logoUrl,
      bannerUrl: restaurant.bannerUrl,
      published: restaurant.published,
    })
    .from(restaurant)
    .where(eq(restaurant.slug, slug))
    .limit(1)

  const r = restaurantRows[0]
  if (!r || !r.published) return null

  const menus = await db
    .select()
    .from(menu)
    .where(and(eq(menu.restaurantId, r.id), eq(menu.active, true)))
    .orderBy(asc(menu.position))

  if (menus.length === 0) {
    return { restaurant: r, menus: [] }
  }

  const categories = await db
    .select()
    .from(category)
    .where(
      inArray(
        category.menuId,
        menus.map((m) => m.id),
      ),
    )
    .orderBy(asc(category.position))

  const items =
    categories.length === 0
      ? []
      : await db
          .select()
          .from(item)
          .where(
            inArray(
              item.categoryId,
              categories.map((c) => c.id),
            ),
          )
          .orderBy(asc(item.position))

  const itemsByCategory = new Map<string, PublicItem[]>()
  for (const c of categories) itemsByCategory.set(c.id, [])
  for (const it of items) {
    itemsByCategory.get(it.categoryId)?.push({
      id: it.id,
      name: it.name,
      description: it.description,
      priceCents: it.priceCents,
      currency: it.currency,
      available: it.available,
      tags: it.tags ?? [],
    })
  }

  const categoriesByMenu = new Map<string, PublicCategory[]>()
  for (const m of menus) categoriesByMenu.set(m.id, [])
  for (const c of categories) {
    categoriesByMenu.get(c.menuId)?.push({
      id: c.id,
      name: c.name,
      description: c.description,
      items: itemsByCategory.get(c.id) ?? [],
    })
  }

  return {
    restaurant: r,
    menus: menus.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      categories: categoriesByMenu.get(m.id) ?? [],
    })),
  }
}

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await loadPublishedRestaurant(slug)
  if (!data) return { title: 'Menu not found' }
  return {
    title: `${data.restaurant.name} · Menu`,
    description:
      data.restaurant.description ?? `Digital menu for ${data.restaurant.name}.`,
  }
}

export default async function PublicMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await loadPublishedRestaurant(slug)
  if (!data) notFound()

  const { restaurant: r, menus } = data
  const totalItems = menus.reduce(
    (sum, m) => sum + m.categories.reduce((s, c) => s + c.items.length, 0),
    0,
  )

  return (
    <main className="mx-auto max-w-2xl px-5 pb-24 pt-10 sm:pt-16">
      <header className="mb-12 text-center">
        {r.logoUrl && (
          // Plain <img> intentionally — next/image needs domain config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.logoUrl}
            alt={`${r.name} logo`}
            className="mx-auto mb-4 h-20 w-20 rounded-full object-cover"
          />
        )}
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {r.name}
        </h1>
        {r.description && (
          <p className="mx-auto mt-3 max-w-md text-balance text-sm text-muted-foreground">
            {r.description}
          </p>
        )}
      </header>

      {totalItems === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          This menu is being prepared. Check back soon.
        </p>
      ) : (
        <div className="space-y-14">
          {menus.map((m) => (
            <section key={m.id} className="space-y-8" aria-labelledby={`menu-${m.id}`}>
              {menus.length > 1 && (
                <h2
                  id={`menu-${m.id}`}
                  className="border-b pb-2 font-heading text-xl font-semibold tracking-tight"
                >
                  {m.name}
                </h2>
              )}
              {m.categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No categories yet.</p>
              ) : (
                m.categories.map((c) => (
                  <section key={c.id} className="space-y-4" aria-labelledby={`cat-${c.id}`}>
                    <header>
                      <h3
                        id={`cat-${c.id}`}
                        className="font-heading text-lg font-medium tracking-tight"
                      >
                        {c.name}
                      </h3>
                      {c.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                      )}
                    </header>
                    {c.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No items.</p>
                    ) : (
                      <ul className="divide-y">
                        {c.items.map((it) => (
                          <li
                            key={it.id}
                            className={
                              'flex items-baseline gap-4 py-3 ' +
                              (it.available ? '' : 'opacity-50')
                            }
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={
                                    'font-medium ' +
                                    (it.available ? '' : 'line-through')
                                  }
                                >
                                  {it.name}
                                </span>
                                {!it.available && (
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium uppercase text-muted-foreground">
                                    Sold out
                                  </span>
                                )}
                              </div>
                              {it.description && (
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {it.description}
                                </p>
                              )}
                              {it.tags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {it.tags.map((t) => (
                                    <span
                                      key={t}
                                      className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                              {formatPrice(it.priceCents, it.currency)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))
              )}
            </section>
          ))}
        </div>
      )}

      <footer className="mt-20 border-t pt-6 text-center text-xs text-muted-foreground">
        Powered by Meta Menu
      </footer>
    </main>
  )
}
