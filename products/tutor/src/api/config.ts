import { cookieNames } from "@iedora/auth-sdk/next"

// Where the tutor backend service lives. The browser NEVER calls it directly —
// every request goes through Next server code (RSC reads + server actions), which
// attaches the caller's Bearer. Defaults to the local dev port (services/tutor).
export const TUTOR_API_URL = process.env.TUTOR_API_URL ?? "http://localhost:8085"

// The access-token cookie auth-next maintains. Derived from the SAME helper +
// prefix auth-next uses (cookiePrefix "tutor" in lib/auth-config), so the name
// stays in lock-step with the auth layer instead of being re-hardcoded here.
export const ACCESS_COOKIE = cookieNames("tutor").access
