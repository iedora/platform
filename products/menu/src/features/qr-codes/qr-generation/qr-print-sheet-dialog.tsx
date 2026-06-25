'use client'

import { AppDialog } from '@iedora/ui/components/app-dialog'
import { QrPrintSheet } from './qr-print-sheet'
import type { QrPrintOptions } from './print-layout'

/**
 * Dialog wrapper around the shared `QrPrintSheet`, built on the product-wide
 * `AppDialog` shell. Used by the cross-tenant QR registry, where print is one
 * row action among many so a modal fits. The owner QR page renders
 * `QrPrintSheet` inline instead. Close + Print sit together in the panel's
 * footer row.
 */
export function QrPrintSheetDialog({
  open,
  onOpenChange,
  code,
  stickerUrl,
  label,
  onPrinted,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  code: string
  stickerUrl: string
  label: string | null
  onPrinted?: (options: QrPrintOptions) => void
}) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="xl" title={`Print sheet · ${code}`}>
      <QrPrintSheet
        code={code}
        stickerUrl={stickerUrl}
        label={label}
        onPrinted={onPrinted}
        onClose={() => onOpenChange(false)}
      />
    </AppDialog>
  )
}
