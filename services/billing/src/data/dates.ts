// Timestamp → ISO-8601 string helpers shared by the billing row mappers. Bun's
// driver hands back a Date for a timestamptz column; tolerate a pre-stringified
// value too.

/** ISO-8601 string of a timestamp value. */
export function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

/** Like {@link iso}, but a null/undefined value (nullable column) → undefined. */
export function isoOpt(v: unknown): string | undefined {
  return v == null ? undefined : iso(v);
}
