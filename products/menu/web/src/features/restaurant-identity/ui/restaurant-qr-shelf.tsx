'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useTranslations } from 'next-intl'
import { Badge } from '@iedora/ui/components/ui/badge'
import { Button } from '@iedora/ui/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@iedora/ui/components/ui/card'
import { QrViewer } from './qr-viewer'
import { QrPrintSheet } from '../../qr-codes/ui/qr-print-sheet'
import { logQrPrintAction } from '../../qr-codes/actions'

/**
 * Per-restaurant QR shelf — the read-only tenant-side view of every QR
 * pointing at this restaurant. Two stacked sections:
 *
 *   1. **Your menu QR** — `/r/<slug>`, the QR most operators want for
 *      menus, business cards, social. Owned by them; freely
 *      regeneratable from the slug.
 *
 *   2. **Bound stickers** — `/q/<code>`, pre-printed sticker codes
 *      assigned to this restaurant cross-tenant by the iedora team via
 *      `/dashboard/admin/qr-codes`. Tagged `Admin-managed` so the
 *      operator immediately understands the section is read-only and
 *      who to contact to change it.
 *
 * Both sections share the same `SectionHeader` rhythm; both are
 * single-column on mobile and gain columns from `sm` upward. The
 * branded card is centred via a grid place so the QR doesn't drift
 * to the left edge on wider viewports.
 */
export function RestaurantQrShelf({
  slug,
  brandedUrl,
  restaurantName,
  stickers,
  publicOrigin,
}: {
  /** Restaurant slug — scopes the print audit event to this restaurant. */
  slug: string
  brandedUrl: string
  restaurantName: string
  /** Sticker codes bound to this restaurant. Empty list = nothing to render below the branded QR. */
  stickers: ReadonlyArray<{
    code: string
    label: string | null
    boundAt: string | null
  }>
  publicOrigin: string
}) {
  const t = useTranslations('Qr')

  // CRM-style record: stacked cards, single column (mobile-first — almost every
  // operator is on a phone). Each concern is its own card: the menu QR, the
  // print sheet, and the admin-managed bound stickers.
  return (
    <div className="space-y-4" data-test-id="restaurant-qr-shelf">
      {/* Mobile: stacked single column. Desktop: one grid, QR (25%) beside the
          print sheet (75%). Bound stickers always span the full width below. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_3fr] lg:items-start">
        {/* Menu QR */}
        <Card data-test-id="restaurant-qr-branded-section">
          <CardHeader>
            <CardTitle>{t('brandedTitle')}</CardTitle>
            <CardDescription>{t('brandedHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <QrViewer publicUrl={brandedUrl} restaurantName={restaurantName} />
          </CardContent>
        </Card>

        {/* Print options inline in their own card (no dialog). Prints a sheet of
            the branded menu QR; audited as "menu". */}
        <Card data-test-id="qr-print-card">
          <CardHeader>
            <CardTitle>{t('printSheet')}</CardTitle>
            <CardDescription>{t('printSectionHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <QrPrintSheet
              code={slug}
              stickerUrl={brandedUrl}
              label={restaurantName}
              onPrinted={(options) => logQrPrintAction(slug, { kind: 'menu', code: slug, ...options })}
            />
          </CardContent>
        </Card>
      </div>

      {/* Bound stickers (admin-managed) */}
      {stickers.length > 0 && (
        <Card data-test-id="restaurant-qr-bound-section">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CardTitle>{t('boundStickersTitle', { count: stickers.length })}</CardTitle>
              <Badge variant="ghost" data-test-id="restaurant-qr-bound-admin-tag">
                {t('adminManagedTag')}
              </Badge>
            </div>
            <CardDescription data-test-id="restaurant-qr-bound-explanation">
              {t('boundStickersExplanation')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stickers.map((s) => (
                <StickerCard
                  key={s.code}
                  code={s.code}
                  label={s.label}
                  stickerUrl={`${publicOrigin}/q/${s.code}`}
                  restaurantName={restaurantName}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const COMPACT_PX = 160
const PNG_EXPORT_PX = 1024

function StickerCard({
  code,
  label,
  stickerUrl,
  restaurantName,
}: {
  code: string
  label: string | null
  stickerUrl: string
  restaurantName: string
}) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('Qr')

  useEffect(() => {
    let cancelled = false
    QRCode.toString(stickerUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((markup) => {
        if (!cancelled) setSvgMarkup(markup)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [stickerUrl])

  async function downloadPng() {
    try {
      const dataUrl = await QRCode.toDataURL(stickerUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: PNG_EXPORT_PX,
        color: { dark: '#000000', light: '#ffffff' },
      })
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      triggerDownload(blob, fileBaseName(restaurantName, code) + '.png')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <article
      className="flex flex-col gap-3 border border-[var(--border)] bg-[var(--background)] p-3"
      data-test-id="qr-sticker-card"
    >
      <div
        className="mx-auto bg-white p-2"
        style={{ width: COMPACT_PX + 16, height: COMPACT_PX + 16 }}
      >
        {svgMarkup ? (
          <div
            style={{ width: COMPACT_PX, height: COMPACT_PX }}
            className="[&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        ) : (
          <div
            style={{ width: COMPACT_PX, height: COMPACT_PX }}
            className="animate-pulse bg-[var(--border)]"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          {t('stickerCodeLabel')} · {code}
        </span>
        {label && (
          <span className="truncate text-sm text-[var(--foreground)]" title={label}>
            {label}
          </span>
        )}
        <span
          className="truncate font-mono text-[10px] text-[var(--muted-foreground)]"
          title={stickerUrl}
        >
          {stickerUrl.replace(/^https?:\/\//, '')}
        </span>
      </div>
      {error && <p className="text-[10px] text-primary">{error}</p>}
      <Button
        type="button"
        variant="ghost"
        onClick={downloadPng}
        disabled={!svgMarkup}
        data-test-id="qr-sticker-download"
        className="w-full"
      >
        {t('downloadPng')}
      </Button>
    </article>
  )
}

function fileBaseName(restaurantName: string, code: string): string {
  const slug = restaurantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${slug || 'restaurant'}-${code}`
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
