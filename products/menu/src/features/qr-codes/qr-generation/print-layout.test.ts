import { describe, expect, it } from 'vitest'
import {
  A4_H_MM,
  A4_W_MM,
  DEFAULT_GUTTER_MM,
  DEFAULT_PAGE_MARGIN_MM,
  DEFAULT_QR_MM,
  MAX_GUTTER_MM,
  MAX_PAGE_MARGIN_MM,
  MAX_QR_MM,
  MIN_GUTTER_MM,
  MIN_PAGE_MARGIN_MM,
  MIN_QR_MM,
  PAGE_SIZES,
  autoFitQrSize,
  clampLayoutInputs,
  computeGrid,
} from './print-layout'

describe('computeGrid', () => {
  it('satisfies the packing inequality 2·margin + n·qr + (n−1)·gutter ≤ A4 on both axes', () => {
    const inputs = { qrSizeMm: 30, gutterMm: 5, pageMarginMm: 4 }
    const { cols, rows } = computeGrid(inputs)
    const widthUsed =
      2 * inputs.pageMarginMm + cols * inputs.qrSizeMm + (cols - 1) * inputs.gutterMm
    const heightUsed =
      2 * inputs.pageMarginMm + rows * inputs.qrSizeMm + (rows - 1) * inputs.gutterMm
    expect(widthUsed).toBeLessThanOrEqual(A4_W_MM)
    expect(heightUsed).toBeLessThanOrEqual(A4_H_MM)
  })

  it('is tight: one more cell on either axis would overflow A4', () => {
    const inputs = { qrSizeMm: 30, gutterMm: 5, pageMarginMm: 4 }
    const { cols, rows } = computeGrid(inputs)
    const oneMoreCol =
      2 * inputs.pageMarginMm + (cols + 1) * inputs.qrSizeMm + cols * inputs.gutterMm
    const oneMoreRow =
      2 * inputs.pageMarginMm + (rows + 1) * inputs.qrSizeMm + rows * inputs.gutterMm
    expect(oneMoreCol).toBeGreaterThan(A4_W_MM)
    expect(oneMoreRow).toBeGreaterThan(A4_H_MM)
  })

  it('returns a zero grid when a single QR cannot fit the printable area', () => {
    const grid = computeGrid({ qrSizeMm: MAX_QR_MM * 3, gutterMm: 5, pageMarginMm: 5 })
    expect(grid).toEqual({ cols: 0, rows: 0, total: 0, mmPerCode: 0 })
  })

  it('reports mmPerCode as the A4 area divided by total cells', () => {
    const grid = computeGrid({
      qrSizeMm: DEFAULT_QR_MM,
      gutterMm: DEFAULT_GUTTER_MM,
      pageMarginMm: DEFAULT_PAGE_MARGIN_MM,
    })
    expect(grid.total).toBeGreaterThan(0)
    expect(grid.mmPerCode).toBeCloseTo((A4_W_MM * A4_H_MM) / grid.total, 5)
  })

  it('a smaller page margin packs at least as many codes as a larger one', () => {
    const tight = computeGrid({ qrSizeMm: 35, gutterMm: 6, pageMarginMm: 3 })
    const loose = computeGrid({ qrSizeMm: 35, gutterMm: 6, pageMarginMm: 12 })
    expect(tight.total).toBeGreaterThanOrEqual(loose.total)
  })
})

describe('page sizes', () => {
  it('defaults to A4 when no page dimensions are passed', () => {
    const def = computeGrid({ qrSizeMm: 35, gutterMm: 6, pageMarginMm: 5 })
    const a4 = computeGrid({
      qrSizeMm: 35,
      gutterMm: 6,
      pageMarginMm: 5,
      pageWMm: PAGE_SIZES.a4.wMm,
      pageHMm: PAGE_SIZES.a4.hMm,
    })
    expect(def).toEqual(a4)
  })

  it('honours an explicit page size in the packing inequality (US Letter)', () => {
    const { wMm, hMm } = PAGE_SIZES.letter
    const inputs = { qrSizeMm: 35, gutterMm: 6, pageMarginMm: 5, pageWMm: wMm, pageHMm: hMm }
    const { cols, rows } = computeGrid(inputs)
    const widthUsed = 2 * inputs.pageMarginMm + cols * inputs.qrSizeMm + (cols - 1) * inputs.gutterMm
    const heightUsed = 2 * inputs.pageMarginMm + rows * inputs.qrSizeMm + (rows - 1) * inputs.gutterMm
    expect(widthUsed).toBeLessThanOrEqual(wMm)
    expect(heightUsed).toBeLessThanOrEqual(hMm)
  })

  it('Legal is taller than Letter, so it fits at least as many rows', () => {
    const base = { qrSizeMm: 35, gutterMm: 6, pageMarginMm: 5 }
    const letter = computeGrid({ ...base, pageWMm: PAGE_SIZES.letter.wMm, pageHMm: PAGE_SIZES.letter.hMm })
    const legal = computeGrid({ ...base, pageWMm: PAGE_SIZES.legal.wMm, pageHMm: PAGE_SIZES.legal.hMm })
    expect(legal.rows).toBeGreaterThanOrEqual(letter.rows)
    expect(legal.total).toBeGreaterThanOrEqual(letter.total)
  })

  it('autoFit respects the chosen page size', () => {
    const r = autoFitQrSize({
      minQrSizeMm: 25,
      gutterMm: DEFAULT_GUTTER_MM,
      pageMarginMm: DEFAULT_PAGE_MARGIN_MM,
      pageWMm: PAGE_SIZES.letter.wMm,
      pageHMm: PAGE_SIZES.letter.hMm,
    })
    const direct = computeGrid({
      qrSizeMm: r.qrSizeMm,
      gutterMm: DEFAULT_GUTTER_MM,
      pageMarginMm: DEFAULT_PAGE_MARGIN_MM,
      pageWMm: PAGE_SIZES.letter.wMm,
      pageHMm: PAGE_SIZES.letter.hMm,
    })
    expect(r.total).toBe(direct.total)
    expect(r.total).toBeGreaterThan(0)
  })
})

describe('autoFitQrSize', () => {
  it('never recommends a QR smaller than the requested floor', () => {
    const r = autoFitQrSize({
      minQrSizeMm: 25,
      gutterMm: DEFAULT_GUTTER_MM,
      pageMarginMm: DEFAULT_PAGE_MARGIN_MM,
    })
    expect(r.qrSizeMm).toBeGreaterThanOrEqual(25)
    expect(r.total).toBeGreaterThan(0)
  })

  it('maximises codes per sheet: no size in the swept range yields more codes', () => {
    const r = autoFitQrSize({
      minQrSizeMm: 25,
      gutterMm: DEFAULT_GUTTER_MM,
      pageMarginMm: DEFAULT_PAGE_MARGIN_MM,
    })
    for (let s = 25; s <= MAX_QR_MM; s += 0.5) {
      const g = computeGrid({
        qrSizeMm: s,
        gutterMm: DEFAULT_GUTTER_MM,
        pageMarginMm: DEFAULT_PAGE_MARGIN_MM,
      })
      expect(g.total).toBeLessThanOrEqual(r.total)
    }
  })

  it('breaks ties toward the largest QR: bumping the result by one step drops the total', () => {
    const r = autoFitQrSize({
      minQrSizeMm: 25,
      gutterMm: DEFAULT_GUTTER_MM,
      pageMarginMm: DEFAULT_PAGE_MARGIN_MM,
    })
    const justAbove = computeGrid({
      qrSizeMm: r.qrSizeMm + 0.5,
      gutterMm: DEFAULT_GUTTER_MM,
      pageMarginMm: DEFAULT_PAGE_MARGIN_MM,
    })
    expect(justAbove.total).toBeLessThan(r.total)
  })

  it('still returns a defined result at the floor when extreme inputs leave little room', () => {
    const r = autoFitQrSize({
      minQrSizeMm: 60,
      gutterMm: MAX_GUTTER_MM,
      pageMarginMm: 15,
    })
    expect(r.qrSizeMm).toBeGreaterThanOrEqual(60)
  })
})

describe('clampLayoutInputs', () => {
  it('substitutes defaults for missing fields', () => {
    expect(clampLayoutInputs({})).toEqual({
      qrSizeMm: DEFAULT_QR_MM,
      gutterMm: DEFAULT_GUTTER_MM,
      pageMarginMm: DEFAULT_PAGE_MARGIN_MM,
    })
  })

  it('clamps below-floor inputs up to the minimums', () => {
    expect(clampLayoutInputs({ qrSizeMm: 1, gutterMm: 0, pageMarginMm: 0 })).toEqual({
      qrSizeMm: MIN_QR_MM,
      gutterMm: MIN_GUTTER_MM,
      pageMarginMm: MIN_PAGE_MARGIN_MM,
    })
  })

  it('clamps above-ceiling inputs down to the maximums', () => {
    expect(
      clampLayoutInputs({ qrSizeMm: 999, gutterMm: 999, pageMarginMm: 999 }),
    ).toEqual({
      qrSizeMm: MAX_QR_MM,
      gutterMm: MAX_GUTTER_MM,
      pageMarginMm: MAX_PAGE_MARGIN_MM,
    })
  })

  it('treats NaN as the floor so free-typed number inputs never produce NaN', () => {
    expect(clampLayoutInputs({ qrSizeMm: NaN, gutterMm: NaN, pageMarginMm: NaN })).toEqual(
      {
        qrSizeMm: MIN_QR_MM,
        gutterMm: MIN_GUTTER_MM,
        pageMarginMm: MIN_PAGE_MARGIN_MM,
      },
    )
  })
})
