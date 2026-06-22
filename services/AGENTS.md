# Backend services (Bun + Hono) — conventions

The iedora backend services live here. They run on **Bun** with **Hono**,
**Kysely** (on Bun's native `SQL`), **jose**, and share runtime infrastructure
via `@iedora/server-kit` and payload contracts via `@iedora/contracts`.

## Vertical slice architecture

Organize each service by **feature slice**, not by technical layer — mirroring
the frontend's `src/features/<slice>/` convention. A slice owns everything for
one capability: its route(s), request/response handling, business logic, and
data access, colocated.

```
services/<svc>/src/
  index.ts                      # Bun entrypoint: load env, wire deps, serve()
  app.ts                        # composition root: mount each slice's routes
  deps.ts                       # cross-slice deps (DB handle, verifiers) wired at boot
  schema.ts                     # Kysely DB types for this service's database
  migrate.ts                    # one-shot migration CLI
  migrations/*.sql              # plain SQL migrations (applied verbatim by server-kit/migrate)
  features/
    <slice>/
      <slice>.routes.ts         # Hono routes for this feature (exported factory)
      <slice>.query.ts          # data access (Kysely) for this feature
      <slice>.service.ts        # business logic, when a slice has more than a query
```

Rules:
- **No cross-layer folders** (`store/`, `handlers/`, `services/`). Code is grouped
  by feature, so a change to one capability touches one slice.
- **`app.ts` stays thin** — build it with `createServiceApp()` (from server-kit:
  the shared Hono `Env` + a global `onError`), then **chain** `.get()/.route()`
  and return the chained value so the exported app type carries the full route
  tree for Hono **RPC**. No business logic here.
- A slice route factory takes `deps` and returns a Hono instance:
  `export function <slice>Routes(deps): Hono<ServiceEnv> { … }`; mount with
  `app.route("/<base>", …)`. (Modular `app.route`, never RoR-style controllers.)
- **Validate at the edge with `@hono/zod-validator`** (`zValidator("query"|"json"|…,
  schema)`) using the shared **zod contracts**, and read `c.req.valid(...)`. Never
  hand-roll `safeParse`; never duplicate a payload type the frontend consumes.
- **Shared, service-wide** concerns (DB types, the deps interface) sit at `src/`
  root; cross-service code goes in `packages/server/*` or `packages/platform/contracts`.

## Kysely / database

- One `Database<DB>` per service (server-kit), on Bun's native `SQL` via
  `kysely-postgres-js`. Transactions: `database.runInTx(...)`; reads/writes use
  `database.db` (the active tx or the pool — AsyncLocalStorage-scoped).
- **DB types are generated**, not hand-written: `bun run db:codegen` runs
  `kysely-codegen` against the service DB → `src/db.generated.ts` (committed).
  Regenerate after every migration; `schema.ts` just aliases the generated `DB`.
- Hand-written SQL stays first-class via Kysely's `sql` tag (keyset comparisons,
  `ON CONFLICT`, etc.). Migrations are plain `.sql` files, applied by
  server-kit's advisory-locked runner.

## Testing

Services run on `bun test` (they need Bun's native `SQL`). Use the shared
harness: `import { createScratchDatabase } from "@iedora/server-kit/testkit"` —
it creates a uniquely-named DB on `TEST_DATABASE_URL` (default: the OrbStack dev
Postgres, `bun run api:up`), runs `migrationsDir`, and returns `{ url, drop }`.

We deliberately do **not** use testcontainers: under Bun it hangs — Bun starts
the container faster than testcontainers-node attaches its wait strategy, so the
log stream has already closed and `start()` never resolves
(testcontainers/testcontainers-node#974; reproduces with every wait strategy, no
released fix). The scratch-DB harness is the Bun-native replacement. In CI, point
`TEST_DATABASE_URL` at a Postgres service.

## Connection pools

`Database` pins the Bun SQL pool (`poolMax`, default 10) + `idleTimeout`/`maxLifetime`
so connections recycle. Bun's default is 10 but historically didn't always
enforce `max` / leaked (oven-sh/bun#23215); on the single prod VM several service
pools must stay well under Postgres `max_connections`. Pass a smaller `poolMax`
for low-traffic pools (e.g. a producer's audit-relay pool).
