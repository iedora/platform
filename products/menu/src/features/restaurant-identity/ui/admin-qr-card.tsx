'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * Compact QR preview for the admin restaurant-detail rail (Pencil "QR
 * code" card): a small on-screen SVG of the restaurant's public URL plus
 * a one-click PNG download. The full-size QR shelf + print sheet live on
 * the owner QR page; this is the read-only admin glance.
 */
export function AdminQrCard({
  publicUrl,
  fileName,
  downloadLabel,
}: {
  publicUrl: string
  fileName: string
  downloadLabel: string
}) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toString(publicUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#1F1A16', light: '#ffffff' },
    })
      .then((markup) => {
        if (!cancelled) setSvg(markup)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [publicUrl])

  async function downloadPng() {
    const dataUrl = await QRCode.toDataURL(publicUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 1024,
      color: { dark: '#000000', light: '#ffffff' },
    })
    const blob = await (await fetch(dataUrl)).blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName + '.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="grid size-[140px] place-items-center rounded-[10px] border border-border bg-white p-2 [&>div]:size-full [&>div>svg]:size-full"
        data-test-id="admin-qr-svg"
      >
        {svg ? (
          // qrcode.toString returns trusted, deterministic SVG markup.
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="size-full animate-pulse rounded bg-[var(--border)]" />
        )}
      </div>
      <button
        type="button"
        onClick={downloadPng}
        disabled={!svg}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:border-foreground disabled:opacity-50"
        data-test-id="admin-qr-download"
      >
        {downloadLabel}
      </button>
    </div>
  )
}
