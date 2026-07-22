/**
 * Parse a value that might already be parsed. Postgres `jsonb`, for example,
 * comes back as a parsed object on some driver configs and as a raw string on
 * others; this normalises either form into the parsed value. Throws on invalid
 * JSON, like `JSON.parse`.
 */
export function parseJson(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value
}
