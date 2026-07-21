<div align="center">

# @iedora/auth

**One auth service for every iedora product — and any domain you point at it.**

Multi-tenant · provider-agnostic · standards-based (Ed25519 JWT · JWKS · OIDC discovery)

</div>

---

A standalone authentication service. A single running instance serves many
products or external domains, each an isolated **tenant** with its own user pool
and its own sign-in providers. Consumers verify tokens with **JWKS** — no
callback to this service required.

Email/password and any **OAuth2 / OIDC** provider (Google, GitHub, Microsoft,
Keycloak, Auth0, …) are added as **configuration, not code**.

## At a glance

- 🏢 **Multi-tenant** — isolated users + providers per domain, from one instance.
- 🔌 **Provider-agnostic** — one `AuthProvider` abstraction; new IdPs are a config row.
- 🔑 **Standards-based** — Ed25519 JWTs, `/.well-known/jwks.json`, OIDC discovery.
- 🔁 **Rotating refresh tokens** — hash-only storage, single-use, revocable.
- 🧱 **Vertical slices** — each feature owns its route + logic over a shared kernel.
- 🥟 **Bun + Hono + Kysely** — fast, typed, small.

## Quickstart

```sh
bun install
docker run -d -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=iedora_auth -p 5432:5432 postgres:18-alpine
cp .env.example .env          # set DATABASE_URL, ADMIN_TOKEN, JWT_SIGNING_KEYS
bun run migrate
bun run dev                   # http://localhost:4000
```

Generate a signing-key seed for `JWT_SIGNING_KEYS`:

```sh
bun -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'))"
```

Then, end to end:

```sh
AUTH=localhost:4000

# provision a tenant + enable password sign-in (admin)
curl -X POST $AUTH/admin/tenants -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" -d '{"slug":"demo","name":"Demo"}'
curl -X POST $AUTH/admin/tenants/demo/providers -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" -d '{"providerId":"password","kind":"password"}'

# register + login (returns access + refresh tokens)
curl -X POST $AUTH/demo/register -H "content-type: application/json" \
  -d '{"email":"a@b.com","password":"supersecret","name":"Ana"}'
curl -X POST $AUTH/demo/login    -H "content-type: application/json" \
  -d '{"email":"a@b.com","password":"supersecret"}'
```

## How it fits together

Vertical slices over a shared platform kernel:

```
src/
├── platform/                  shared kernel (cross-cutting)
│   ├── config.ts
│   ├── db.ts · schema.ts       Kysely client + typed schema
│   ├── tokens.ts               Ed25519 JWT · JWKS · OIDC discovery · refresh tokens
│   ├── accounts.ts             user / identity / session operations
│   ├── http.ts                 Hono env · tenant middleware · error shaping
│   └── providers/              ← the generic core
│       ├── types.ts              AuthProvider = PasswordProvider | OAuthProvider
│       ├── password.ts           Bun Argon2id
│       ├── oauth.ts              generic OAuth2/OIDC, config-driven
│       └── registry.ts           resolve a tenant's enabled providers
├── features/                  one folder per slice (route + logic)
│   ├── register · login · refresh · logout · whoami
│   ├── oauth                    external IdP: authorize → callback
│   ├── well-known               jwks.json · openid-configuration
│   └── tenants                  admin provisioning
└── index.ts                   compose slices · Bun.serve
```

**Data model (per tenant, isolated):** `tenant` → `tenant_provider` (enabled
providers + config), `user`, `identity` (one per linked provider), `session`
(hashed refresh tokens).

## Endpoints

**Root** (one issuer, all tenants)

| Method | Path | |
|---|---|---|
| `GET`  | `/up` | liveness |
| `GET`  | `/.well-known/jwks.json` | public keys |
| `GET`  | `/.well-known/openid-configuration` | OIDC discovery |
| `POST` | `/admin/tenants` | create a tenant *(Bearer `ADMIN_TOKEN`)* |
| `POST` | `/admin/tenants/:slug/providers` | enable a provider |

**Tenant** (`/:tenant/…`)

| Method | Path | |
|---|---|---|
| `GET`  | `/providers` | enabled sign-in options |
| `POST` | `/register` · `/login` | email + password |
| `POST` | `/refresh` | rotate a refresh token (old one revoked) |
| `POST` | `/logout` | revoke a refresh session |
| `GET`  | `/whoami` | decode the bearer access token |
| `GET`  | `/oauth/:provider/authorize` → `/oauth/:provider/callback` | external IdP |

## Add any external provider (no code)

```sh
curl -X POST $AUTH/admin/tenants/demo/providers \
  -H "authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"providerId":"google","kind":"oauth2","config":{
        "authorizationEndpoint":"https://accounts.google.com/o/oauth2/v2/auth",
        "tokenEndpoint":"https://oauth2.googleapis.com/token",
        "userinfoEndpoint":"https://openidconnect.googleapis.com/v1/userinfo",
        "clientId":"…","clientSecret":"…","scope":"openid email profile"}}'
```

Field names default to the OIDC standard (`sub`/`email`/`name`); override
`subjectField`/`emailField`/`nameField` for a non-standard provider.

## Integrate a service

Use the SDK — [`@iedora/auth-sdk`](./sdk) (co-located in this repo; the Next.js middleware half is [`@iedora/auth-sdk-nextjs`](./sdk-nextjs)) — for a typed client + JWKS verifier:

```ts
import { createAuthVerifier, createAuthClient } from "@iedora/auth-sdk"

const verify = createAuthVerifier({ issuer: "https://auth.iedora.com", audience: "demo" })
const claims = await verify(accessToken) // local, JWKS-cached — service not in the path

const auth = createAuthClient({ baseUrl: "https://auth.iedora.com", tenant: "demo" })
const session = await auth.login({ email, password })
```

Or verify directly with `jose` against `/.well-known/jwks.json`.

## Security

- **Passwords** — Bun Argon2id; only the hash is stored.
- **Refresh tokens** — opaque random secret; **only its SHA-256 is stored** and
  refresh **rotates** (old session revoked), so a stolen token is single-use.
- **Access tokens** — short-lived Ed25519 JWTs, verified via JWKS. Key rotation is
  additive: the newest key signs, all keys stay published until in-flight tokens expire.
- **OAuth** — `state` carried in an httpOnly cookie to block CSRF.
- **Login** — generic errors; never reveals whether an email exists.

## Deploy

Runs as a Bun server on `:4000` with a `/up` healthcheck. Deployed with Kamal via
[`iedora-infra`](../infra) (`kamal/auth`) at **auth.iedora.com**; see that repo's
`kamal/auth/README.md` for database, secrets, and CI setup.

## Testing

`scripts/battle-test.sh` runs a full end-to-end pass against a live instance —
tenant provisioning, register/login, JWKS signature verification, org +
membership RBAC, refresh rotation with reuse-detection, password reset via the
outbox, self-service account management, and the service-token-gated `/manage`
API. Boot a local Postgres + the service (see Quickstart), then run it.

## Scripts

`bun run dev` · `bun run start` · `bun run migrate` · `bun run typecheck`
