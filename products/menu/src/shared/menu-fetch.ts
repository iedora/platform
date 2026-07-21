import { ApiError, authedFetch, errorMessageFromResponse } from '@iedora/api-client'

/**
 * The menu product's server-side BFF fetch — the menu-specific wrapper around
 * the generic `authedFetch` (Bearer + one-shot 401 refresh) from the foundation
 * `@iedora/api-client`. Lives here, not in the foundation package, so that
 * package stays product-neutral (the tutor surface has its own equivalent under
 * `products/tutor/src/api/`). Server-only; the browser never calls the services.
 */

/** The menu backend base URL. Dev matches `compose.yaml`; prod is the
 *  network-internal DNS name. */
export const MENU_URL = process.env.MENU_URL ?? 'http://localhost:8184'

/**
 * Fetch against the menu API with the caller's Bearer token. `path` is
 * service-relative (e.g. `/api/restaurants`); absolute URLs pass through. On a
 * 401 with a live refresh cookie, `authedFetch` refreshes once and retries.
 */
export async function serverFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${MENU_URL}${path}`
  return authedFetch(url, init)
}

/** serverFetch + JSON decode, throwing ApiError on non-2xx. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await serverFetch(path, init)
  if (!res.ok) throw new ApiError(res.status, await errorMessageFromResponse(res))
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
