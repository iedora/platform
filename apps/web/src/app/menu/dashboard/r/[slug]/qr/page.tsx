import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { requireRestaurantBySlug } from '@iedora/product-menu/features/auth'
import { listQrCodesForRestaurant } from '@iedora/product-menu/features/qr-codes'
import { RestaurantQrShelf } from '@iedora/product-menu/features/restaurant-identity/ui/restaurant-qr-shelf'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { PRODUCTS, productUrl } from '@iedora/brand'

export default async function QrPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { restaurant: r } = await requireRestaurantBySlug(slug)
  const t = await getTranslations('Restaurant')

  // Build the public origin from the actual request host so QR codes work
  // behind tunnels (Cloudflare, ngrok) and on whatever domain the user
  // reaches the dashboard from. x-forwarded-host wins over host because
  // edge proxies set it to the public domain while host stays upstream.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  // Path prefix the menu surface lives under in THIS environment ("/menu" in
  // dev, "" in prod where the host rewrite strips it). Keep the request host
  // (tunnel/ngrok support, per above) and add the prefix so dev links resolve.
  const menuPath = new URL(productUrl(PRODUCTS.menu)).pathname.replace(/\/+$/, '')
  const publicOrigin = `${proto}://${host}${menuPath}`
  const brandedUrl = `${publicOrigin}/r/${r.slug}`

  // Bound stickers for this restaurant. Note: the service only
  // exposes the staff-wide QR list, so this is empty for non-staff
  // operators (the shelf section simply doesn't render).
  const stickerRows = await listQrCodesForRestaurant(r.id)
  const stickers = stickerRows.map((row) => ({
    code: row.code,
    label: row.label,
    boundAt: row.boundAt,
  }))

  return (
    <DashboardPage
      title={t('qrCode')}
      chrome="none"
      data-test-id="restaurant-qr"
    >
      {/* Title + location come from the server-rendered @breadcrumb slot
          (name › QR code), so the page body starts straight at the cards. */}
      <RestaurantQrShelf
        slug={r.slug}
        brandedUrl={brandedUrl}
        restaurantName={r.name}
        stickers={stickers}
        publicOrigin={publicOrigin}
      />
    </DashboardPage>
  )
}
