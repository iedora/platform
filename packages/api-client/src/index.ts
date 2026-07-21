// Product-neutral BFF fetch helpers. Auth (session, login, cookies) lives in the
// centralized @iedora/auth-sdk/next; this package is just the Bearer-attaching
// fetch + the error type products' typed clients throw.
export { ApiError, errorMessageFromResponse } from './error'
export { authedFetch } from './authed-fetch'
