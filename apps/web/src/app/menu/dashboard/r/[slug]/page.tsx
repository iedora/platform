import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { requireRestaurantBySlug } from '@iedora/product-menu/features/auth'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { formatEditedAt } from '@iedora/product-menu/shared/ui/editorial-list'
import { CreateMenuDialog } from '@iedora/product-menu/features/menu-builder/ui/create-menu-dialog'

/**
 * Restaurant home — single column, mobile-canonical.
 *
 * Layout: menu hero (the menu itself is the page's primary content;
 * tap → editor), then one labeled *section card* per action — QR ·
 * Settings · View public menu. Every action has equal weight, the
 * same tap target size, and the same rhythm. Mobile is the canonical
 * layout; desktop just widens the gutters.
 */
export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // i18n is independent of the restaurant lookup — kick it off
  // concurrently with the auth round-trip. The guard's single API call
  // already returns the menu summaries alongside the restaurant.
  const tPromise = getTranslations('Restaurant')
  const tDashPromise = getTranslations('Dashboard')
  const localePromise = getLocale()
  const { restaurant: r, menus } = await requireRestaurantBySlug(slug)
  const primaryMenu = menus[0] ?? null

  const [t, tDash, locale] = await Promise.all([
    tPromise,
    tDashPromise,
    localePromise,
  ])

  return (
    // chrome="none" — on mobile the title block ate ~120px of vertical
    // space repeating what the sidebar already says (which restaurant
    // we're on). The menu hero card carries the restaurant identity
    // through its own content; the h1 stays for a11y + SEO.
    <DashboardPage
      title={r.name}
      data-test-id="restaurant"
      chrome="none"
    >
      {primaryMenu ? (
        <>
          {/* ── Menu hero ───────────────────────────────────────────
              The menu itself is the page's primary content. Tap → editor. */}
          <section data-test-id="restaurant-menu-section">
            <Link
              href={`/dashboard/r/${slug}/m/${primaryMenu.id}`}
              data-test-id={`restaurant-menu-card-${primaryMenu.id}`}
              className="flex min-h-[88px] cursor-pointer items-center gap-[14px] rounded-lg border bg-card py-[18px] pl-5 pr-[18px] text-foreground no-underline transition-colors duration-[120ms] hover:border-primary hover:bg-muted"
            >
              <div className="min-w-0 flex-1">
                <h2 className="m-0 overflow-hidden text-ellipsis whitespace-nowrap font-heading text-[22px] font-bold leading-[1.2] text-foreground">
                  {primaryMenu.name}
                </h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {t('categoryCount', { count: primaryMenu.categoryCount })}
                  <span aria-hidden="true"> · </span>
                  {t('dishCount', { count: primaryMenu.dishCount })}
                  <span aria-hidden="true"> · </span>
                  {tDash('editedAt', {
                    when: formatEditedAt(new Date(primaryMenu.updatedAt), locale),
                  })}
                </p>
              </div>
              <span
                className="shrink-0 text-[26px] leading-none text-muted-foreground"
                aria-hidden="true"
              >
                ›
              </span>
            </Link>

            {/* Additional menus (rare) sit just under the hero. */}
            {menus.length > 1 && (
              <ul
                className="m-0 grid list-none gap-0 overflow-hidden rounded-lg border p-0"
                data-test-id="restaurant-menu-extra-list"
              >
                {menus.slice(1).map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/dashboard/r/${slug}/m/${m.id}`}
                      data-test-id={`restaurant-menu-row-${m.id}`}
                      className="flex min-h-[56px] items-center justify-between border-t px-4 py-[14px] text-foreground no-underline hover:bg-muted [li:first-child_&]:border-t-0"
                    >
                      <span className="font-heading text-base">
                        {m.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('dishCount', { count: m.dishCount })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Action sections ─────────────────────────────────────
              Each action gets its own labeled card. Equal weight,
              identical rhythm — nothing shouts over the others. */}
          <div className="grid gap-3" data-test-id="restaurant-actions">
            <Link
              href={`/dashboard/r/${slug}/qr`}
              className="flex min-h-[88px] cursor-pointer flex-row items-center gap-[14px] rounded-lg border bg-card px-[18px] pb-4 pt-[18px] text-foreground no-underline transition-colors duration-[120ms] hover:border-muted-foreground hover:bg-muted"
              data-test-id="restaurant-action-qr"
            >
              <div className="grid min-w-0 flex-1 gap-1">
                <h3 className="m-0 font-heading text-[18px] font-medium leading-[1.25] text-foreground">
                  {t('qrCodeTitle')}
                </h3>
                <p className="m-0 text-[13.5px] leading-[1.45] text-muted-foreground">
                  {t('qrCodeLede')}
                </p>
              </div>
              <span
                className="shrink-0 text-[24px] leading-none text-muted-foreground"
                aria-hidden="true"
              >
                ›
              </span>
            </Link>

            <Link
              href={`/dashboard/r/${slug}/theme`}
              className="flex min-h-[88px] cursor-pointer flex-row items-center gap-[14px] rounded-lg border bg-card px-[18px] pb-4 pt-[18px] text-foreground no-underline transition-colors duration-[120ms] hover:border-muted-foreground hover:bg-muted"
              data-test-id="restaurant-action-settings"
            >
              <div className="grid min-w-0 flex-1 gap-1">
                <h3 className="m-0 font-heading text-[18px] font-medium leading-[1.25] text-foreground">
                  {t('settingsTitle')}
                </h3>
                <p className="m-0 text-[13.5px] leading-[1.45] text-muted-foreground">
                  {t('settingsLede')}
                </p>
              </div>
              <span
                className="shrink-0 text-[24px] leading-none text-muted-foreground"
                aria-hidden="true"
              >
                ›
              </span>
            </Link>

            <Link
              href={`/r/${r.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[88px] cursor-pointer flex-row items-center gap-[14px] rounded-lg border bg-card px-[18px] pb-4 pt-[18px] text-foreground no-underline transition-colors duration-[120ms] hover:border-muted-foreground hover:bg-muted"
              data-test-id="restaurant-action-view"
            >
              <div className="grid min-w-0 flex-1 gap-1">
                <h3 className="m-0 font-heading text-[18px] font-medium leading-[1.25] text-foreground">
                  {t('viewPublicTitle')}
                </h3>
                <p className="m-0 text-[13.5px] leading-[1.45] text-muted-foreground">
                  {t('viewPublicLede')}
                </p>
              </div>
              <span
                className="shrink-0 text-[24px] leading-none text-muted-foreground"
                aria-hidden="true"
              >
                ↗
              </span>
            </Link>
          </div>
        </>
      ) : (
        // ── Empty state ────────────────────────────────────────────
        // Primary: seed a sample menu. Secondary: blank menu from
        // scratch. (The AI photo-import flow is gone until the
        // backend grows an import endpoint.)
        <section
          className="grid gap-3 rounded-lg border bg-card px-5 pb-[26px] pt-7 text-center"
          data-test-id="restaurant-empty"
        >
          <h2 className="m-0 font-heading text-[26px] font-medium text-foreground">
            {t('emptyTitle')}
          </h2>
          <p className="m-0 mx-auto max-w-[42ch] text-sm text-muted-foreground">
            {t('emptyLede')}
          </p>
          <div className="mt-1.5 flex flex-col items-stretch gap-2.5 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-center">
            <CreateMenuDialog slug={slug} />
          </div>
        </section>
      )}
    </DashboardPage>
  )
}
