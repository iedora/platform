export const A4_W_MM = 210
export const A4_H_MM = 297

export type PageSizeKey = 'a4' | 'letter' | 'legal'

/**
 * Physical sheet sizes the print sheet supports, portrait, in millimetres.
 * A4 is ISO 216; Letter/Legal are the US ANSI sizes (8.5×11 / 8.5×14 in).
 */
export const PAGE_SIZES: Record<PageSizeKey, { wMm: number; hMm: number; label: string }> = {
  a4: { wMm: A4_W_MM, hMm: A4_H_MM, label: 'A4' },
  letter: { wMm: 215.9, hMm: 279.4, label: 'US Letter' },
  legal: { wMm: 215.9, hMm: 355.6, label: 'US Legal' },
}

export const DEFAULT_PAGE_SIZE: PageSizeKey = 'a4'

/**
 * CSS `@page { size }` keyword per sheet. Setting it makes the print driver
 * select the matching physical paper, so 1mm in the layout maps to 1mm on
 * paper (no browser "fit to page" rescale that would shrink the modules).
 */
export const PAGE_SIZE_CSS: Record<PageSizeKey, string> = {
  a4: 'A4',
  letter: 'letter',
  legal: 'legal',
}

export const MIN_PAGE_MARGIN_MM = 3
export const MAX_PAGE_MARGIN_MM = 15
export const DEFAULT_PAGE_MARGIN_MM = 5

export const MIN_GUTTER_MM = 4
export const MAX_GUTTER_MM = 20
export const DEFAULT_GUTTER_MM = 6

export const MIN_QR_MM = 20
export const MAX_QR_MM = 80
export const DEFAULT_QR_MM = 35

export type PrintLayoutInputs = {
  qrSizeMm: number
  gutterMm: number
  pageMarginMm: number
  /** Sheet width in mm. Defaults to A4 width when omitted. */
  pageWMm?: number
  /** Sheet height in mm. Defaults to A4 height when omitted. */
  pageHMm?: number
}

export type PrintGrid = {
  cols: number
  rows: number
  total: number
  mmPerCode: number
}

/** The user's print-sheet choices — surfaced to callers (e.g. audit) on print. */
export type QrPrintOptions = {
  pageSize: PageSizeKey
  qrSizeMm: number
  gutterMm: number
  pageMarginMm: number
  cutMarks: boolean
  perSheet: number
}

export type AutoFitInputs = {
  minQrSizeMm: number
  gutterMm: number
  pageMarginMm: number
  pageWMm?: number
  pageHMm?: number
  stepMm?: number
}

export type AutoFitResult = PrintGrid & { qrSizeMm: number }

/** Clamp each field into its [min, max] band, substituting defaults for missing values. */
export function clampLayoutInputs(raw: Partial<PrintLayoutInputs>): PrintLayoutInputs {
  return {
    qrSizeMm: clamp(raw.qrSizeMm ?? DEFAULT_QR_MM, MIN_QR_MM, MAX_QR_MM),
    gutterMm: clamp(raw.gutterMm ?? DEFAULT_GUTTER_MM, MIN_GUTTER_MM, MAX_GUTTER_MM),
    pageMarginMm: clamp(
      raw.pageMarginMm ?? DEFAULT_PAGE_MARGIN_MM,
      MIN_PAGE_MARGIN_MM,
      MAX_PAGE_MARGIN_MM,
    ),
  }
}

/**
 * Pack a uniform grid of square QR cells inside an A4 page under
 * `2·pageMargin + cols·qr + (cols−1)·gutter ≤ A4_W` (symmetric for height).
 * `pageMargin` is the printer-safe outer band; `gutter` is the scissor
 * lane between cells and doubles as the QR quiet zone.
 */
export function computeGrid({
  qrSizeMm,
  gutterMm,
  pageMarginMm,
  pageWMm = A4_W_MM,
  pageHMm = A4_H_MM,
}: PrintLayoutInputs): PrintGrid {
  const printableW = pageWMm - 2 * pageMarginMm
  const printableH = pageHMm - 2 * pageMarginMm
  const denom = qrSizeMm + gutterMm
  if (denom <= 0 || printableW < qrSizeMm || printableH < qrSizeMm) {
    return { cols: 0, rows: 0, total: 0, mmPerCode: 0 }
  }
  const cols = Math.max(0, Math.floor((printableW + gutterMm) / denom))
  const rows = Math.max(0, Math.floor((printableH + gutterMm) / denom))
  const total = cols * rows
  const mmPerCode = total > 0 ? (pageWMm * pageHMm) / total : 0
  return { cols, rows, total, mmPerCode }
}

/**
 * Sweep QR size from `MAX_QR_MM` down to `minQrSizeMm` and return the
 * size that maximises codes per sheet, breaking ties in favour of the
 * largest QR (same paper cost, easier scan).
 */
export function autoFitQrSize(inputs: AutoFitInputs): AutoFitResult {
  const step = inputs.stepMm ?? 0.5
  const lo = clamp(inputs.minQrSizeMm, MIN_QR_MM, MAX_QR_MM)
  const gutterMm = clamp(inputs.gutterMm, MIN_GUTTER_MM, MAX_GUTTER_MM)
  const pageMarginMm = clamp(
    inputs.pageMarginMm,
    MIN_PAGE_MARGIN_MM,
    MAX_PAGE_MARGIN_MM,
  )
  const { pageWMm, pageHMm } = inputs

  let best: AutoFitResult = { qrSizeMm: lo, cols: 0, rows: 0, total: -1, mmPerCode: 0 }
  for (let s = MAX_QR_MM; s >= lo; s -= step) {
    const g = computeGrid({ qrSizeMm: s, gutterMm, pageMarginMm, pageWMm, pageHMm })
    if (g.total > best.total) best = { qrSizeMm: round1(s), ...g }
  }
  if (best.total < 0) {
    best = { qrSizeMm: lo, ...computeGrid({ qrSizeMm: lo, gutterMm, pageMarginMm, pageWMm, pageHMm }) }
  }
  return best
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min
  return Math.max(min, Math.min(max, v))
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}
