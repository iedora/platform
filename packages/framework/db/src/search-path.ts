/**
 * Pin a connection's `search_path` to a schema via the libpq `options`
 * parameter, set at connection-init time. This is the pool-safe way to isolate a
 * service to its own schema in a shared database: unlike a runtime `SET
 * search_path`, it applies to EVERY pooled connection and never leaks across
 * checkouts (a real footgun under transaction pooling).
 *
 * The whole point is "internally separated, splittable later": a service's
 * queries + migrations stay unqualified and land in its schema; to split it onto
 * its own database later you just drop the schema (point at a DB where `public`
 * is the default) — no code change.
 */
export function withSearchPath(url: string, schema: string | undefined): string {
  if (!schema) return url
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new Error(`withSearchPath: unsafe schema name "${schema}"`)
  }
  const sep = url.includes("?") ? "&" : "?"
  // `-c search_path=<schema>` — space + '=' percent-encoded so libpq/Bun SQL
  // parse the option verbatim.
  return `${url}${sep}options=-c%20search_path%3D${schema}`
}
