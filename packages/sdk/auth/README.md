# @iedora/auth-sdk

Client + token verifier for [`@iedora/auth`](../../../auth). Framework-agnostic —
Node, Bun, and edge. Three pieces:

- **`createAuthVerifier`** — verify access tokens locally against JWKS (for your
  API / SSR / middleware). The auth service is never in your request path.
- **`createAuthClient`** — a typed client for the auth API (register, login,
  refresh, logout, whoami, providers, OAuth start).
- **`createManageClient`** + **`mintServiceToken`** — the server-side management
  API (admin user/org/session lookups) and client-credentials service-token
  minting for backend callers.

```sh
bun add @iedora/auth-sdk   # or npm / pnpm
```

## Verify a token (server-side)

```ts
import { createAuthVerifier } from "@iedora/auth-sdk"

const verify = createAuthVerifier({
  issuer: "https://auth.iedora.com",
  audience: "tutor", // your tenant slug
})

const claims = await verify(accessToken) // throws on invalid/expired
// claims.sub = user id · claims.tenant · claims.email
```

Keys are fetched once and cached (and refreshed on rotation), so verification is
local and fast.

### Next.js example

```ts
// middleware.ts or a server action
const claims = await verify(token).catch(() => null)
if (!claims) return unauthorized()
```

## Call the auth API (client-side or server-side)

```ts
import { AuthError, createAuthClient } from "@iedora/auth-sdk"

const auth = createAuthClient({ baseUrl: "https://auth.iedora.com", tenant: "tutor" })

const session = await auth.login({ email, password })
//    session.user · session.accessToken · session.refreshToken

const fresh = await auth.refresh(session.refreshToken) // old refresh token is revoked
await auth.logout(fresh.refreshToken)

// external providers
const { providers } = await auth.providers()
window.location.href = auth.oauthAuthorizeUrl("google")
```

Errors are typed:

```ts
try {
  await auth.login({ email, password })
} catch (e) {
  if (e instanceof AuthError && e.code === "invalid_credentials") { /* … */ }
}
```

## API

`createAuthVerifier({ issuer, audience? }) => (token) => Promise<AuthClaims>`

`createAuthClient({ baseUrl, tenant, fetch? })` →
`register` · `login` · `refresh` · `logout` · `whoami` · `providers` ·
`oauthAuthorizeUrl(provider)`

`createManageClient({ baseUrl, … })` → admin user/org/session reads (`ManageClient`).

`mintServiceToken({ authBaseUrl, clientId, clientSecret })` → a client-credentials
service token for backend-to-backend calls (raw, one-shot).

`new ServiceTokenSource(authBaseUrl, clientId, clientSecret)` (from
`@iedora/auth-sdk/tokens`) → a cached `TokenSource`: mints on demand, caches until
just before `exp`, de-dupes concurrent cold-cache mints. Hand it to an authed
client (`@iedora/billing-sdk`, `@iedora/audit-sdk`) as the outbound Bearer. The
zero-dep `/tokens` subexport pulls no jose, so callers that only mint stay lean.

Build: `bun run build` (emits `dist/`). Typecheck: `bun run typecheck`.
