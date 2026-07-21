import Link from 'next/link'
import { BRAND_NAME, brandUrl } from '@iedora/brand'
import type { RenderProps } from '../../types'
import { formatPrice } from '../../format'
import { CategoryNav } from '../../category-nav'

export function ClassicMenu({ restaurant: r, menus }: RenderProps) {
  const totalItems = menus.reduce(
    (sum, m) => sum + m.categories.reduce((s, c) => s + c.items.length, 0),
    0,
  )
  // Flat category list across all menus for the pill nav (anchor-scroll).
  const navCategories = menus.flatMap((m) =>
    m.categories
      .filter((c) => c.items.length > 0)
      .map((c) => ({ id: c.id, name: c.name })),
  )

  return (
    <main className="mx-auto max-w-2xl px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
      <header className="mb-5 flex items-center gap-4">
        {r.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.logoUrl}
            alt={`${r.name} logo`}
            className="h-16 w-16 shrink-0 rounded-2xl object-cover"
          />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{r.name}</h1>
          {r.description && (
            <p
              className="mt-1 text-balance text-sm leading-snug"
              style={{ color: 'var(--menu-secondary)' }}
            >
              {r.description}
            </p>
          )}
        </div>
      </header>

      {/* Category pills — sticky, horizontal scroll, scroll-spy active state. */}
      {navCategories.length > 1 && (
        <CategoryNav
          variant="classic"
          ariaLabel="Categories"
          items={navCategories.map((c) => ({ id: c.id, label: c.name }))}
        />
      )}

      {totalItems === 0 ? (
        <p
          className="rounded-2xl border border-dashed p-8 text-center text-sm"
          style={{ color: 'var(--menu-secondary)' }}
        >
          This menu is being prepared. Check back soon.
        </p>
      ) : (
        <div className="space-y-10">
          {menus.map((m) => (
            <section key={m.id} className="space-y-8" aria-labelledby={`menu-${m.id}`}>
              {menus.length > 1 && (
                <h2
                  id={`menu-${m.id}`}
                  className="border-b pb-2 text-xl font-semibold tracking-tight"
                >
                  {m.name}
                </h2>
              )}
              {m.categories.map((c) => (
                <section
                  key={c.id}
                  id={`cat-${c.id}`}
                  className="scroll-mt-16 space-y-3"
                  aria-labelledby={`cat-heading-${c.id}`}
                >
                  <header>
                    <h3
                      id={`cat-heading-${c.id}`}
                      className="text-lg font-bold tracking-tight"
                    >
                      {c.name}
                    </h3>
                    {c.description && (
                      <p className="mt-0.5 text-sm" style={{ color: 'var(--menu-secondary)' }}>
                        {c.description}
                      </p>
                    )}
                  </header>
                  {c.items.length > 0 && (
                    <ul className="divide-y">
                      {c.items.map((it) => {
                        const variants = it.variants ?? []
                        return (
                          <li key={it.id} data-item-id={it.id} className="flex items-start gap-4 py-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-3">
                                <h4 className="font-semibold leading-snug">{it.name}</h4>
                                {variants.length === 0 && it.priceCents > 0 && (
                                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                                    {formatPrice(it.priceCents, it.currency)}
                                  </span>
                                )}
                              </div>
                              {it.description && (
                                <p
                                  className="mt-0.5 text-[13.5px] leading-snug"
                                  style={{ color: 'var(--menu-secondary)' }}
                                >
                                  {it.description}
                                </p>
                              )}
                              {it.tags.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {it.tags.map((t) => (
                                    <span
                                      key={t}
                                      className="rounded-full border px-2 py-0.5 text-xs"
                                      style={{ color: 'var(--menu-secondary)' }}
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {variants.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                                  {variants.map((v, vi) => (
                                    <span key={`${v.label}-${vi}`} className="inline-flex items-baseline gap-1.5">
                                      <span style={{ color: 'var(--menu-secondary)' }}>{v.label}</span>
                                      <span className="font-semibold tabular-nums">
                                        {formatPrice(v.priceCents, it.currency)}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {it.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={it.imageUrl}
                                alt=""
                                className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-20 sm:w-20"
                              />
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              ))}
            </section>
          ))}
        </div>
      )}

      <footer
        className="mt-16 border-t pt-6 text-center text-xs"
        style={{ color: 'var(--menu-secondary)' }}
      >
        Powered by Menu · an{' '}
        <Link
          href={brandUrl()}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit' }}
        >
          {BRAND_NAME}
        </Link>{' '}
        product
      </footer>
    </main>
  )
}
