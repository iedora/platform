// @iedora/product-tutor/api — the tutor Next app's BFF client. Server-only. Attaches
// the caller's Bearer and talks to services/tutor; the browser never calls the
// service directly. Per-endpoint wrappers live in apps/web (or a shared api
// module), built on `apiJson` (path-based) or the typed `tutor` RPC client.
export { ApiError, apiJson, serverFetch } from "./server-fetch"
export { ACCESS_COOKIE, TUTOR_API_URL } from "./config"
