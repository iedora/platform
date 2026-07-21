# @iedora/service-kit

The shared Bun+Hono runtime every iedora backend service boots on. Re-exports the
[`@iedora/server-kit`](../server-kit) kernel (auth/JWT/validation/HTTP primitives)
and adds the runtime layer:

- **`createServiceApp<Env>()`** — a `Hono` app pre-wired with OTel middleware and the
  shared `onError`.
- **`serve(app, { name, port, onShutdown })`** — graceful `Bun.serve` with SIGTERM/SIGINT drain.
- **`Database<DB>`** — Kysely with transaction-in-context (`runInTx`, `.db`), `.ping()`, `.close()`.
- **`runMigrations` / `ensureDatabase`** — advisory-locked SQL migration runner + per-service DB/role provisioning.
- **`healthRoutes(ping)`** — `GET /up` → 200/503.
- **Config + env** — `env` / `requireEnv` / `durationMs`, `_FILE` secret expansion
  (`expandFileSecrets`), `siblingUrl(role, port, self)`, and `iso` / `isoOpt` dates.
- **Postgres error helpers** — `isUniqueViolation`, `sqlState`, `isInvalidUUID`.
- **Refresh tokens** — `newRefreshToken()` / `hashRefreshToken()` (opaque base64url
  token + its sha256 hash for the sessions table).
- **OTel** — `initOtel` / `shutdownOtel`, `tracer` / `logger`, `traceIds`, span
  attribution.

Test helpers live on the **`@iedora/service-kit/testkit`** subpath —
`createScratchDatabase()` provisions a throwaway Postgres DB for integration tests.

Product-agnostic — a service imports everything from `@iedora/service-kit`. A
product's own server kit (e.g. `@iedora/menu-kit`) re-exports this package and adds
only product-specific runtime on top. Domain concerns are NOT here: audit/email/
billing are separate services reached over their SDKs, and the outbox/inbox is
`@iedora/messaging`.

```ts
import { createServiceApp, serve, Database, healthRoutes } from "@iedora/service-kit"

const db = new Database<AppDB>(DATABASE_URL)
const app = createServiceApp<AppEnv>()
  .route("/", healthRoutes(() => db.ping()))
  .route("/api", apiRoutes(deps))

serve(app, { name: "my-service", port, onShutdown: () => db.close() })
```
