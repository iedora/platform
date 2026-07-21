import "server-only"

import { cookies } from "next/headers"

import { ACCESS_COOKIE, TUTOR_API_URL } from "./config"

/** Thrown on a non-2xx service response; carries the upstream status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message?: string,
  ) {
    super(message ?? `tutor-api: ${status}`)
    this.name = "ApiError"
  }
}

// serverFetch — the ONE outbound path to the tutor service. Reads the caller's
// access token from the `tutor_access` cookie (kept fresh by the auth-next refresh
// middleware on navigation) and attaches it as the Bearer. Server-only; the
// browser never reaches the service directly.
//
// TODO(phase 2): retry once on 401 by refreshing via the app's auth-next instance
// (mirrors menu's api-client). For now the refresh middleware covers page loads.
export async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const jar = await cookies()
  const token = jar.get(ACCESS_COOKIE)?.value
  const headers = new Headers(init?.headers)
  if (token) headers.set("authorization", `Bearer ${token}`)
  const url = path.startsWith("http") ? path : `${TUTOR_API_URL}${path}`
  return fetch(url, { ...init, headers, cache: "no-store" })
}

/** serverFetch + JSON parse; throws ApiError on non-2xx, returns undefined on 204. */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await serverFetch(path, init)
  if (res.status === 204) return undefined as T
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return (await res.json()) as T
}
