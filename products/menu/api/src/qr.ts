// Physical QR sticker code helpers. Codes are a
// cross-tenant registry; the store side (resolve/admin) lives in data/qr.ts.

// Crockford-flavoured base32 minus lookalikes (0/O, 1/I/L, U): codes survive
// being read aloud or retyped from a sticker.
const QR_ALPHABET = "abcdefghjkmnpqrstvwxyz23456789";
const GENERATED_QR_LEN = 8;
const qrPattern = /^[a-z0-9_-]{1,64}$/;

/** Canonicalizes operator input. */
export function normalizeQRCode(raw: string): string {
  return raw.trim().toLowerCase();
}

/** True if a normalized code has an acceptable shape. */
export function validQRCode(code: string): boolean {
  return qrPattern.test(code);
}

// Mints a random sticker code (~39 bits; the PK uniqueness check is the final
// guard against the astronomically rare collision).
export function generateQRCode(): string {
  const buf = new Uint8Array(GENERATED_QR_LEN);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += QR_ALPHABET[b % QR_ALPHABET.length];
  return out;
}
