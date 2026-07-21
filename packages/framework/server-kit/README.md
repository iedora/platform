# @iedora/server-kit

The shared backend kernel for a Hono/Bun (or Node) service — auth, JWTs, HTTP
helpers. No product logic.

**HTTP**
- `HttpError` + `onError` — throw `new HttpError(422, "invalid_input", msg)`.
- `validate(target, schema)` — zod request validation.
- `bearerAuth(verify)` / `typedBearer({ verify, setKey, invalidMsg })`.
- `reqContext`, `readBearer`, `up` (health probe).

**Auth kernel**
- `userAuth(verifier)` — Hono gate for user access tokens → sets `user`.
  `verifyAccessToken`, `hasRole`.
- `serviceAuth(verifier)` — gate for internal EdDSA service tokens → sets `clientId`.
  `ServiceTokenIssuer`, `verifyServiceToken`, `parseClients`,
  `newServiceVerifier`, `parseEd25519PublicKey`. Callers mint with
  `ServiceTokenSource` from [`@iedora/auth-sdk/tokens`](https://github.com/iedora/auth/tree/main/sdk).
- `JwtIssuer` — mint Ed25519 access tokens + serve JWKS. `parseEd25519Seed`.
- `hashPassword` / `verifyPassword` (argon2id).
- `ServiceClient` — authed fetch to another service; inject a header transform for tracing.

```ts
import { userAuth, newUserVerifier, hashPassword, JwtIssuer } from "@iedora/server-kit"

const verify = newUserVerifier(publicKey, issuer, audience)
app.use("/api/*", userAuth(verify))            // 401s unless a valid access token
app.get("/api/me", (c) => c.json(c.get("user")))

const issuer = new JwtIssuer({ keys, kid: "k1", issuer, audience })
const token = await issuer.issueAccess({ userId, roles: ["owner"] })
```
