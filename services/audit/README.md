# @iedora/audit-service

The **audit service** for the iedora platform: a standalone Hono/Bun microservice
that ingests audit events from every other service over HTTP and serves the
read/query API over an append-only, time-partitioned `audit_log`.

Framework-direct — built on [`@iedora/service-kit`](https://github.com/iedora/framework),
with no product coupling. The store (ingest/dedupe/diff + query) is vendored
in-repo under `src/store` (not a separate `@iedora/audit` package). Producers talk
to it only through the co-located [`@iedora/audit-sdk`](./sdk).

## Why a separate service

Audit is a cross-cutting concern: auth, billing, menu, and tutor all emit events,
but none of them should own the log or be able to write another service's tables.
So the log lives here, and the hard rule is **producers never touch `audit_log`
through the database** — they enqueue an event on their own transactional outbox,
a relay drains it, and it crosses the wire as an authenticated HTTP POST.

```
 producer service                         audit service (this repo)
 ┌─────────────────┐   service token      ┌──────────────────────────┐
 │ business tx      │   POST /events       │ serviceAuth              │
 │  └ enqueue(audit)│ ───────────────────▶ │  └ inbox.handleOnce      │
 │ outbox relay     │   {messageId,payload}│      └ record → audit_log │
 └─────────────────┘                       └──────────────────────────┘
        at-least-once  ──────────────────▶  deduped on messageId = exactly-once
```

## Endpoints

| method | path | who | purpose |
|---|---|---|---|
| `POST` | `/events` | producers (service token) | ingest a batch `{ events: [{ messageId, payload }] }`, deduped on `messageId` |
| `GET`  | `/obs/events` | readers (service token) | query the log: filter by `tenant` / `actor` / `action` (prefix) / `outcome` / `source` / `target`, keyset-paginated newest-first via `(before_at, before_id)` |
| `GET`  | `/up` | infra | health |

The store is vendored in `src/store` (partitioned `audit_log` + BRIN/entity/actor/action
indexes). The menu-era action-log API shape is preserved by mapping
`entity_type/id → target` and `metadata.session_id/trace_id → session/trace`.

## Run locally

```sh
bun install
AUDIT_DATABASE_URL=postgres://iedora:iedora@localhost:5432/audit bun run migrate
AUDIT_DATABASE_URL=... SERVICE_JWT_PUBLIC_KEY=... SERVICE_JWT_ISSUER=... bun run dev
```

`bun install` needs a GitHub Packages read token for the `@iedora` scope:
`.npmrc` reads `NODE_AUTH_TOKEN` (e.g. `NODE_AUTH_TOKEN="$(gh auth token)" bun install`).

## Environment

| var | required | purpose |
|---|---|---|
| `AUDIT_DATABASE_URL` | ✓ | the service's own database (runtime role) |
| `ADMIN_DATABASE_URL` | migrate-time | superuser on `/postgres`; creates the db + role in prod |
| `SERVICE_JWT_PUBLIC_KEY` | ✓ | Ed25519 public key that signs service tokens (base64 raw) |
| `SERVICE_JWT_ISSUER` | ✓ | expected service-token issuer |
| `SERVICE_AUDIENCE` | | expected audience (default `iedora-internal`) |
| `AUDIT_PORT` | | listen port (default `8081`) |

## Deploy

`docker build` runs the TypeScript directly (Bun, no build step). The image needs
the GitHub Packages read token as a BuildKit secret:

```sh
docker build --secret id=node_auth_token,env=NODE_AUTH_TOKEN -t iedora-audit .
```

Migrations run as a one-shot (`bun run migrate`) before boot; the runtime only
serves. Database-per-service: the runtime role connects to `AUDIT_DATABASE_URL`
alone.

## Client SDK

The typed client + emitter contracts live in [`sdk/`](./sdk) and publish as
`@iedora/audit-sdk` (see `.github/workflows/publish-sdk.yml`). Producers emit
through it and readers query through it:

```ts
import { AuditClient } from "@iedora/audit-sdk"
const audit = new AuditClient({ baseUrl, tokens }) // tokens: service-token source
await audit.ingest([{ messageId, payload }])
```

It also exports the producer-side contracts (`Auditor`, `AuditEvent`,
`buildEnvelope`, `AUDIT_TOPIC`) so every service builds identical envelopes.

## Layout

```
src/
  index.ts                  compose root — Database, verifier, serve
  app.ts                    createServiceApp + route tree (health, ingest, query)
  contracts.ts              vendored wire DTOs (no shared contracts package)
  features/ingest/          POST /events — inbox-deduped receiver
  features/events/          GET /obs/events — keyset query
migrations/0001_init.sql    audit_log (partitioned) + inbox_message
sdk/                        @iedora/audit-sdk — client + emitter contracts
```
