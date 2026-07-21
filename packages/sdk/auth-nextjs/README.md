# @iedora/auth-sdk-nextjs

Next.js integration for the iedora auth service. Wire auth with config + one
domain hook — no cookie/middleware/verify plumbing to re-implement.

- **`createAuthNext(config, { onAuthenticated })`** → cookie session, JWKS
  `getClaims()`, and `actions` (register/login/logout/completeOAuth) you re-export
  from a `"use server"` module. `onAuthenticated` is your one hook (e.g. ensure a
  profile row).
- **`@iedora/auth-sdk-nextjs/middleware`** → `createRefreshMiddleware(config)` — rotates
  an expired access token (edge-safe: fetch + cookies).
- **`@iedora/auth-sdk-nextjs/client`** → `oauthAuthorizeUrl(opts, provider, redirect)` —
  works for any provider enabled on the tenant.

```ts
// lib/auth.ts
export const authNext = createAuthNext(
  { baseUrl: process.env.AUTH_BASE_URL!, tenant: "acme", cookiePrefix: "acme" },
  { onAuthenticated: (u) => ensureProfile(u) },
)

// app/(auth)/actions.ts  — "use server"
export const loginAction = (i) => authNext.actions.login(i)

// lib/session.ts
const claims = await authNext.getClaims()   // verified, or null

// middleware.ts
export const middleware = createRefreshMiddleware({ baseUrl, tenant: "acme", cookiePrefix: "acme" })
```

`next` is a peer; depends on `@iedora/auth-sdk`.
