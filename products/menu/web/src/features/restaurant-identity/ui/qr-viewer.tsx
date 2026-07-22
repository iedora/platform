'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useTranslations } from 'next-intl'
import { errorMessage, stripProtocol } from '@iedora/common'
import { Button } from '@iedora/ui/components/ui/button'

// PNG export resolution — high enough that downloaded prints stay sharp. The
// on-screen preview is responsive (CSS), so it needs no fixed pixel size.
const PNG_EXPORT_PX = 1024

// Preview + vector/PNG downloads of the branded menu QR. Printing lives in the
// adjacent inline QrPrintSheet panel (page size, cut marks, etc.), so this is
// download-only.
export function QrViewer({
  publicUrl,
  restaurantName,
}: {
  publicUrl: string
  restaurantName: string
}) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('Qr')

  useEffect(() => {
    let cancelled = false
    QRCode.toString(publicUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((markup) => {
        if (!cancelled) setSvgMarkup(markup)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [publicUrl])

  function downloadSvg() {
    if (!svgMarkup) return
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' })
    triggerDownload(blob, fileBaseName(restaurantName) + '.svg')
  }

  async function downloadPng() {
    try {
      const dataUrl = await QRCode.toDataURL(publicUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: PNG_EXPORT_PX,
        color: { dark: '#000000', light: '#ffffff' },
      })
      // toDataURL returns base64; convert to a Blob so the download lands as
      // an actual binary file rather than a navigated data URI.
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      triggerDownload(blob, fileBaseName(restaurantName) + '.png')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="w-full space-y-5">
      <div
        data-test-id="qr-printable"
        className="qr-printable mx-auto flex w-full max-w-[260px] flex-col items-center gap-4 border border-[var(--border)] bg-white p-4"
      >
        {svgMarkup ? (
          <div
            data-test-id="qr-svg"
            className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full"
            // qrcode.toString returns trusted, deterministic SVG markup.
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        ) : (
          <div className="aspect-square w-full animate-pulse bg-[var(--border)]" />
        )}
        <div className="space-y-1 text-center">
          <p className="font-heading text-base font-semibold text-[var(--foreground)]">
            {restaurantName}
          </p>
          <p className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            {t('scan')}
          </p>
          {/* Fallback URL — printed alongside the QR so anyone who can't
              scan can still type the address. Protocol stripped to keep
              the line tight; full URL is the title for hover/copy. */}
          <p
            className="break-all font-mono text-[10px] text-[var(--muted-foreground)]"
            title={publicUrl}
            data-test-id="qr-public-url"
          >
            {stripProtocol(publicUrl)}
          </p>
        </div>
      </div>

      {error && (
        <p
          data-test-id="qr-error"
          className="text-sm text-primary"
        >
          {error}
        </p>
      )}

      {/* Stack full-width on mobile so each button is a comfortable
          thumb target. From sm+ they sit in a centered inline row. */}
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center print:hidden">
        <Button
          type="button"
          onClick={downloadSvg}
          disabled={!svgMarkup}
          data-test-id="qr-download-svg"
          className="w-full sm:w-auto"
        >
          {t('downloadSvg')}
        </Button>
        <Button
          type="button"
          onClick={downloadPng}
          disabled={!svgMarkup}
          data-test-id="qr-download-png"
          className="w-full sm:w-auto"
        >
          {t('downloadPng')}
        </Button>
      </div>
    </div>
  )
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

function fileBaseName(restaurantName: string): string {
  return (
    'menu-qr-' +
      restaurantName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'menu-qr'
  )
}
