/**
 * Pure URL hygiene — no env, no `server-only`, no I/O. Sits alongside
 * `@/shared/url` (which holds `publicUrl()` — needs env) so that
 * consumers of the pure validator don't transitively load env.ts.
 *
 * Use on every user-supplied path before constructing a URL with it:
 * `?next=…`, `?return_url=…`, `redirect_uri=…`.
 */

/**
 * Returns true iff `raw` is a same-origin path the app can safely
 * redirect to. Rejects absolute URLs (`http://evil`), protocol-
 * relative URLs (`//evil`), and the `/\` bypass trick.
 */
export function isSameOriginPath(raw: string): boolean {
  if (!raw) return false
  if (!raw.startsWith('/')) return false
  if (raw.startsWith('//')) return false
  if (raw.startsWith('/\\')) return false
  return true
}

/**
 * Returns true iff `raw` is a parseable absolute URL whose hostname is
 * the iedora apex or any of its subdomains (`iedora.com`,
 * `menu.iedora.com`, `core.iedora.com`, …). Used by the `core` product
 * to validate cross-product redirect targets — a sign-in flow on core
 * needs to accept `next=https://menu.iedora.com/…` while rejecting
 * arbitrary off-site hosts.
 *
 * `localhost` (any port) is also accepted so the same validator works
 * in dev. Tests pin both prod + local origins.
 */
export function isSameIedoraOrigin(raw: string | undefined | null): boolean {
  if (!raw) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === 'iedora.com' || host.endsWith('.iedora.com')) return true
  return false
}
