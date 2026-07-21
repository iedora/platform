# @iedora/email-service

The **email service** for the iedora platform: a standalone Hono/Bun microservice
that receives transactional emails from every other service over HTTP and delivers
them via SMTP.

Framework-direct — built on [`@iedora/service-kit`](https://github.com/iedora/framework)
and `@iedora/email`, with no product coupling. Producers talk to it only through
[`@iedora/email-sdk`](https://github.com/iedora/framework/tree/main/packages/email-sdk).

## Why a separate service

SMTP credentials and delivery concerns (retries, dedupe, provider config) belong
in one place, not copied into every service that needs to send a password-reset or
receipt. Producers enqueue an email on their own transactional outbox in the same
transaction as the business change; a relay drains it and POSTs it here. That keeps
the email atomic with the change that triggered it, and out-of-band with the
request that caused it.

```
 producer service                         email service (this repo)
 ┌─────────────────┐   service token      ┌──────────────────────────┐
 │ business tx      │   POST /messages     │ serviceAuth              │
 │  └ enqueue(email)│ ───────────────────▶ │  └ inbox.handleOnce      │
 │ outbox relay     │  {messageId,payload} │      └ mailer.send (SMTP) │
 └─────────────────┘                       └──────────────────────────┘
        at-least-once  ──────────────────▶  deduped on messageId = one email
```

## Endpoints

| method | path | who | purpose |
|---|---|---|---|
| `POST` | `/messages` | producers (service token) | deliver a batch `{ messages: [{ messageId?, payload }] }`; `payload` is an `EmailMessage` (`to`, `subject`, `html`, `text`) |
| `GET`  | `/up` | infra | health |

A `messageId` (the producer's outbox id) is deduped through the `@iedora/messaging`
inbox, so at-least-once redelivery sends exactly once. A direct send with no
`messageId` is sent every time. With no `SMTP_HOST` the mailer swallows to a dev
JSON transport (logs instead of sending), so the service boots and dedupes without
a real SMTP server.

## Run locally

```sh
bun install
EMAIL_DATABASE_URL=postgres://iedora:iedora@localhost:5432/email bun run migrate
EMAIL_DATABASE_URL=... EMAIL_FROM="iedora <no-reply@iedora.com>" \
  SERVICE_JWT_PUBLIC_KEY=... SERVICE_JWT_ISSUER=... bun run dev
```

`bun install` needs a GitHub Packages read token for the `@iedora` scope:
`.npmrc` reads `NODE_AUTH_TOKEN` (e.g. `NODE_AUTH_TOKEN="$(gh auth token)" bun install`).

## Environment

| var | required | purpose |
|---|---|---|
| `EMAIL_DATABASE_URL` | ✓ | the service's own database (idempotency inbox) |
| `ADMIN_DATABASE_URL` | migrate-time | superuser on `/postgres`; creates the db + role in prod |
| `EMAIL_FROM` | ✓ | default From address, e.g. `iedora <no-reply@iedora.com>` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | | SMTP transport (unset → dev JSON transport; `:465` → TLS) |
| `SERVICE_JWT_PUBLIC_KEY` | ✓ | Ed25519 public key that signs service tokens |
| `SERVICE_JWT_ISSUER` | ✓ | expected service-token issuer |
| `SERVICE_AUDIENCE` | | expected audience (default `iedora-internal`) |
| `EMAIL_PORT` | | listen port (default `8082`) |

## Deploy

`docker build` runs the TypeScript directly (Bun, no build step). The image needs
the GitHub Packages read token as a BuildKit secret:

```sh
docker build --secret id=node_auth_token,env=NODE_AUTH_TOKEN -t iedora-email .
```

Migrations run as a one-shot (`bun run migrate`) before boot; the runtime only
serves. Database-per-service: the runtime role connects to `EMAIL_DATABASE_URL`
alone. Two tables: the `@iedora/messaging` inbox (`inbox_message`, dedupe) and
`email_delivery` (the delivery log — one row per send, `status` sent/failed).

## Client SDK

The typed client lives in [`sdk/`](./sdk) and publishes as `@iedora/email-sdk`
(see `.github/workflows/publish-sdk.yml`). Producers deliver through it:

```ts
import { EmailClient } from "@iedora/email-sdk"
const email = new EmailClient({ baseUrl, tokens }) // tokens: service-token source
await email.send({ to, subject, html, text })
```

## Layout

```
src/
  index.ts                  compose root — Database, mailer, verifier, serve
  app.ts                    createServiceApp + route tree (health, send, deliveries)
  features/send/            POST /messages — inbox-deduped SMTP delivery
  features/deliveries/      GET /deliveries — the delivery log (keyset, filter by status/source/tenant/to)
migrations/0001_init.sql    inbox_message
migrations/0002_delivery.sql email_delivery
sdk/                        @iedora/email-sdk — typed client: send() + query()
```
