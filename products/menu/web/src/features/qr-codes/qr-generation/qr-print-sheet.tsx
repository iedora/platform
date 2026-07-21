'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { Button } from '@iedora/ui/components/ui/button'
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldHint,
  SelectField,
} from '@iedora/ui/components/field'
import { Checkbox } from '@iedora/ui/components/ui/checkbox'
import {
  DEFAULT_GUTTER_MM,
  DEFAULT_PAGE_MARGIN_MM,
  DEFAULT_PAGE_SIZE,
  DEFAULT_QR_MM,
  MAX_GUTTER_MM,
  MAX_PAGE_MARGIN_MM,
  MAX_QR_MM,
  MIN_GUTTER_MM,
  MIN_PAGE_MARGIN_MM,
  MIN_QR_MM,
  PAGE_SIZES,
  PAGE_SIZE_CSS,
  type PageSizeKey,
  autoFitQrSize,
  clampLayoutInputs,
  computeGrid,
  type PrintGrid,
  type QrPrintOptions,
} from './print-layout'

const PAGE_OPTIONS: { value: PageSizeKey; label: string }[] = (
  Object.keys(PAGE_SIZES) as PageSizeKey[]
).map((key) => ({
  value: key,
  label: `${PAGE_SIZES[key].label} · ${PAGE_SIZES[key].wMm} × ${PAGE_SIZES[key].hMm} mm`,
}))

/**
 * Print-sheet controls (page size · QR size · cut gutter · page margin · cut
 * marks · live summary · tips · Print) plus the hidden, mm-accurate print sheet
 * it renders to `window.print()`. Self-contained and chromeless so it can be
 * dropped inline on the owner QR page OR wrapped in a Dialog
 * (`QrPrintSheetDialog`) for the cross-tenant QR registry — one implementation,
 * both surfaces.
 */
export function QrPrintSheet({
  code,
  stickerUrl,
  label,
  onPrinted,
  onClose,
  className,
}: {
  code: string
  stickerUrl: string
  label: string | null
  /** Fired after print is invoked, with the chosen options (for audit). */
  onPrinted?: (options: QrPrintOptions) => void
  /** When set (dialog mode), a Close button sits next to Print in the footer. */
  onClose?: () => void
  className?: string
}) {
  const [pageSize, setPageSize] = useState<PageSizeKey>(DEFAULT_PAGE_SIZE)
  const [qrSizeInput, setQrSizeInput] = useState<number>(DEFAULT_QR_MM)
  const [gutterInput, setGutterInput] = useState<number>(DEFAULT_GUTTER_MM)
  const [pageMarginInput, setPageMarginInput] = useState<number>(DEFAULT_PAGE_MARGIN_MM)
  const [cutMarks, setCutMarks] = useState<boolean>(true)
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null)
  const page = PAGE_SIZES[pageSize]
  // Hydration gate for the print-sheet portal: false during SSR and the
  // hydration render, true on the client ever after. useSyncExternalStore
  // expresses this without a setState-in-effect cascade.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  // margin: 0 — the print sheet's gutter supplies the QR's quiet zone.
  useEffect(() => {
    let cancelled = false
    QRCode.toString(stickerUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((markup) => {
        if (!cancelled) setSvgMarkup(markup)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [stickerUrl])

  const inputs = useMemo(
    () => ({
      ...clampLayoutInputs({
        qrSizeMm: qrSizeInput,
        gutterMm: gutterInput,
        pageMarginMm: pageMarginInput,
      }),
      pageWMm: page.wMm,
      pageHMm: page.hMm,
    }),
    [qrSizeInput, gutterInput, pageMarginInput, page.wMm, page.hMm],
  )
  const grid = useMemo(() => computeGrid(inputs), [inputs])

  // Use the current QR size as the floor so Auto-fit never shrinks below what
  // the user has already accepted as scannable.
  const handleAutoFit = () => {
    const fit = autoFitQrSize({
      minQrSizeMm: inputs.qrSizeMm,
      gutterMm: inputs.gutterMm,
      pageMarginMm: inputs.pageMarginMm,
      pageWMm: page.wMm,
      pageHMm: page.hMm,
    })
    setQrSizeInput(fit.qrSizeMm)
  }

  const canPrint = Boolean(svgMarkup) && grid.total > 0
  function handlePrint() {
    window.print()
    onPrinted?.({
      pageSize,
      qrSizeMm: inputs.qrSizeMm,
      gutterMm: inputs.gutterMm,
      pageMarginMm: inputs.pageMarginMm,
      cutMarks,
      perSheet: grid.total,
    })
  }

  return (
    <div className={className} data-test-id="qr-print-sheet-panel">
      <SelectField
        id="qr-print-page"
        data-test-id="qr-print-sheet-page"
        label="Page size"
        value={pageSize}
        onValueChange={(v) => setPageSize(v as PageSizeKey)}
        options={PAGE_OPTIONS}
        hint="Match this to the paper in your printer."
        className="mb-3 gap-1.5"
      />
      <div
        className="grid gap-x-4 gap-y-2 sm:grid-cols-3 sm:grid-rows-[auto_auto_auto]"
        data-test-id="qr-print-sheet-controls"
      >
        <Field className="gap-y-2 sm:row-span-3 sm:grid-rows-subgrid">
          <FieldLabel htmlFor="qr-print-size">QR size (mm)</FieldLabel>
          <FieldInput
            id="qr-print-size"
            data-test-id="qr-print-sheet-size"
            type="number"
            compact
            min={MIN_QR_MM}
            max={MAX_QR_MM}
            step={1}
            value={qrSizeInput}
            onChange={(e) => setQrSizeInput(Number(e.target.value))}
          />
          <FieldHint>At least {MIN_QR_MM} mm so it scans from table distance.</FieldHint>
        </Field>
        <Field className="gap-y-2 sm:row-span-3 sm:grid-rows-subgrid">
          <FieldLabel htmlFor="qr-print-gutter">Cut gutter (mm)</FieldLabel>
          <FieldInput
            id="qr-print-gutter"
            data-test-id="qr-print-sheet-gutter"
            type="number"
            compact
            min={MIN_GUTTER_MM}
            max={MAX_GUTTER_MM}
            step={1}
            value={gutterInput}
            onChange={(e) => setGutterInput(Number(e.target.value))}
          />
          <FieldHint>
            Space to cut between codes. Each sticker keeps half of it as its quiet
            zone, so keep it at 4 mm or more.
          </FieldHint>
        </Field>
        <Field className="gap-y-2 sm:row-span-3 sm:grid-rows-subgrid">
          <FieldLabel htmlFor="qr-print-margin">Page margin (mm)</FieldLabel>
          <FieldInput
            id="qr-print-margin"
            data-test-id="qr-print-sheet-margin"
            type="number"
            compact
            min={MIN_PAGE_MARGIN_MM}
            max={MAX_PAGE_MARGIN_MM}
            step={1}
            value={pageMarginInput}
            onChange={(e) => setPageMarginInput(Number(e.target.value))}
          />
          <FieldHint>Safe outer band your printer won&apos;t cut into.</FieldHint>
        </Field>
      </div>

      <label
        className="mt-3 flex items-center gap-2 text-sm text-[var(--foreground)]"
        data-test-id="qr-print-sheet-cutmarks"
      >
        <Checkbox checked={cutMarks} onCheckedChange={(v) => setCutMarks(v === true)} />
        Show cut marks (dashed line down the middle of each gutter)
      </label>

      <PrintSheetSummary
        grid={grid}
        pageLabel={page.label}
        pageWMm={page.wMm}
        pageHMm={page.hMm}
        onAutoFit={handleAutoFit}
        autoFitDisabled={!svgMarkup}
      />

      <PrintTips />

      {onClose ? (
        // Dialog mode: Close + Print on one right-aligned footer row.
        <div className="mt-4 flex flex-row justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose} data-test-id="qr-print-sheet-close">
            Close
          </Button>
          <Button
            variant="default"
            type="button"
            disabled={!canPrint}
            onClick={handlePrint}
            data-test-id="qr-print-sheet-print"
          >
            Print
          </Button>
        </div>
      ) : (
        // Inline mode (owner QR page): a single full-width Print button.
        <Button
          variant="default"
          type="button"
          disabled={!canPrint}
          onClick={handlePrint}
          data-test-id="qr-print-sheet-print"
          className="mt-4 w-full sm:w-auto"
        >
          Print
        </Button>
      )}

      {mounted &&
        createPortal(
          <PrintSheet
            svgMarkup={svgMarkup}
            qrSizeMm={inputs.qrSizeMm}
            gutterMm={inputs.gutterMm}
            pageMarginMm={inputs.pageMarginMm}
            pageWMm={page.wMm}
            pageHMm={page.hMm}
            pageCss={PAGE_SIZE_CSS[pageSize]}
            cutMarks={cutMarks}
            grid={grid}
            code={code}
            label={label}
          />,
          document.body,
        )}
    </div>
  )
}

function PrintSheetSummary({
  grid,
  pageLabel,
  pageWMm,
  pageHMm,
  onAutoFit,
  autoFitDisabled,
}: {
  grid: PrintGrid
  pageLabel: string
  pageWMm: number
  pageHMm: number
  onAutoFit: () => void
  autoFitDisabled: boolean
}) {
  const cm2PerCode = grid.mmPerCode / 100
  return (
    <div
      className="mt-4 flex flex-col gap-2 border border-[var(--border)] bg-[var(--background)] p-3 sm:flex-row sm:items-center sm:justify-between"
      data-test-id="qr-print-sheet-summary"
    >
      <div>
        <p className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          {pageLabel} · {pageWMm} × {pageHMm} mm
        </p>
        <p className="mt-1 text-sm text-[var(--foreground)]">
          {grid.cols} × {grid.rows} ={' '}
          <strong data-test-id="qr-print-sheet-total">{grid.total}</strong> QR code
          {grid.total === 1 ? '' : 's'} per sheet
        </p>
        {grid.total > 0 && (
          <p
            className="mt-0.5 text-[11px] text-[var(--muted-foreground)]"
            data-test-id="qr-print-sheet-per-code"
          >
            ≈ {cm2PerCode.toFixed(1)} cm² of paper per sticker
          </p>
        )}
        {grid.total === 0 && (
          <p className="mt-1 text-xs text-primary">
            Nothing fits at these values. Reduce the QR size or gutter.
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        onClick={onAutoFit}
        disabled={autoFitDisabled}
        data-test-id="qr-print-sheet-autofit"
      >
        Auto-fit
      </Button>
    </div>
  )
}

/**
 * Print guidance grounded in ISO/IEC 18004 + common scan-reliability rules:
 * vector output, a real quiet zone, generous module size, and 1:1 scale.
 */
function PrintTips() {
  return (
    <div
      className="mt-4 border border-[var(--border)] bg-[var(--background)] p-3"
      data-test-id="qr-print-sheet-tips"
    >
      <p className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        Print tips
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12px] text-[var(--muted-foreground)]">
        <li>
          Print at <strong>100% scale</strong>. Turn off “Fit to page” or “Shrink
          oversized pages” so 1&nbsp;mm here stays 1&nbsp;mm on paper.
        </li>
        <li>
          Keep codes <strong>20&nbsp;mm or bigger</strong>. A rough guide is 1/10th of
          the scan distance, so about 40&nbsp;mm for a table.
        </li>
        <li>
          The gutter is the quiet zone. A code needs about <strong>4 clear modules</strong>{' '}
          around it to scan, so don&apos;t trim it too tight.
        </li>
        <li>
          Use a <strong>laser printer at 300+ DPI</strong> on matte paper. Black on
          white, and avoid glossy stock that bounces phone flashes back.
        </li>
        <li>
          Scan one before you cut the whole sheet. Paper and ink spread can differ
          from the preview.
        </li>
      </ul>
    </div>
  )
}

// Hidden on screen; materializes only inside the @print stylesheet. Sized in mm
// so the printer driver matches the physical sheet.
function PrintSheet({
  svgMarkup,
  qrSizeMm,
  gutterMm,
  pageMarginMm,
  pageWMm,
  pageHMm,
  pageCss,
  cutMarks,
  grid,
  code,
  label,
}: {
  svgMarkup: string | null
  qrSizeMm: number
  gutterMm: number
  pageMarginMm: number
  pageWMm: number
  pageHMm: number
  pageCss: string
  cutMarks: boolean
  grid: PrintGrid
  code: string
  label: string | null
}) {
  const cells = svgMarkup && grid.total > 0 ? grid.total : 0
  // Cut line down the middle of each gutter: an outline pushed half a gutter out
  // from the cell. Adjacent cells' outlines meet on the same line, so each
  // sticker keeps a gutter/2 quiet zone when cut along it. outline (not border)
  // so it never shifts the grid geometry.
  const cellCut = cutMarks
    ? { outline: '0.2mm dashed #999', outlineOffset: `${gutterMm / 2}mm` }
    : undefined
  return (
    <div id="qr-print-sheet-root" aria-hidden="true">
      <style>{`
        #qr-print-sheet-root { position: fixed; inset: 0; visibility: hidden; pointer-events: none; z-index: -1; }
        #qr-print-sheet-root svg { width: 100%; height: 100%; display: block; }
        @media print {
          @page { size: ${pageCss}; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body > *:not(#qr-print-sheet-root) { display: none !important; }
          #qr-print-sheet-root { position: static; visibility: visible; pointer-events: auto; z-index: auto; }
        }
      `}</style>
      <div
        id="qr-print-sheet"
        data-test-id="qr-print-sheet"
        data-qr-code={code}
        data-qr-label={label ?? ''}
        style={{
          width: `${pageWMm}mm`,
          height: `${pageHMm}mm`,
          padding: `${pageMarginMm}mm`,
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(grid.cols, 1)}, ${qrSizeMm}mm)`,
          gridAutoRows: `${qrSizeMm}mm`,
          gap: `${gutterMm}mm`,
          justifyContent: 'start',
          alignContent: 'start',
          background: '#fff',
        }}
      >
        {Array.from({ length: cells }).map((_, i) => (
          <div
            key={i}
            style={{ width: `${qrSizeMm}mm`, height: `${qrSizeMm}mm`, ...cellCut }}
            dangerouslySetInnerHTML={{ __html: svgMarkup as string }}
          />
        ))}
      </div>
    </div>
  )
}

// Inert subscription for the hydration gate above — the value never changes
// after mount, so there is nothing to subscribe to.
function emptySubscribe() {
  return () => {}
}
