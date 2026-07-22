/**
 * Sticker-code helpers. Codes can be either:
 *
 *   1. Custom — admin supplies the string (e.g. a code already printed on a
 *      physical sticker). Validated by `isValidQrCodeShape`.
 *   2. Generated — the admin asks for one. `generateQrCode()` returns an
 *      8-char Crockford-base32 string minus visually ambiguous glyphs
 *      (0/O, 1/I/L, U). 8 chars across 30 symbols ≈ 39 bits, ~5e11 codes —
 *      collision probability is microscopic for batches in the thousands;
 *      the PK uniqueness check at insert time is the final guard.
 *
 * Stickers may be printed mixed-case but we canonicalise to lower-case so
 * `/q/ABC` and `/q/abc` resolve to the same row.
 */

import { randomString } from '@iedora/common'

const GEN_LEN = 8
const MAX_LEN = 64
const SHAPE = /^[a-z0-9_-]+$/

export function generateQrCode(): string {
  return randomString(GEN_LEN)
}

export function normalizeQrCode(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidQrCodeShape(raw: string): boolean {
  if (raw.length === 0 || raw.length > MAX_LEN) return false
  return SHAPE.test(raw)
}
