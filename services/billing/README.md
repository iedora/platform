# @iedora/billing-service

The **billing service** for the iedora platform: a standalone Hono/Bun
microservice owning subscriptions, the append-only invoice ledger over a
code-defined plan registry, the pluggable payment kinds (manual + Stripe), and
marketplace payouts/refunds.

Framework-direct — built on [`@iedora/service-kit`](https://github.com/iedora/framework)
and `@iedora/billing` (money math), with no product coupling and no shared server
kit. Consumers talk to it only through the co-located [`@iedora/billing-sdk`](./sdk).

## Why a separate service

Money is the highest-blast-radius concern on the platform, so it runs on its own
database, its own deploy, and its own isolated DB role — nothing else can read or
write the ledger directly. Products (menu, tutor) call it over the network via
`@iedora/billing-sdk`; they never share its schema. Stripe keys live only here.

## Endpoints (service-token gated, mounted under `/billing`)

| method | path | purpose |
|---|---|---|
| `POST` | `/subscribe` | activate or change a tenant's plan |
| `POST` | `/cancel` | end a subscription for a product |
| `GET`  | `/subscriptions` | a tenant's subscriptions |
| `GET`  | `/invoices` | a tenant's invoices, or the recent feed |
| `POST` | `/invoices` | record a manual/cash payment as a paid invoice |
| `POST` | `/charges` | create a one-off charge (kind + mode explicit) |
| `GET`  | `/charges/:id` | fetch a charge |
| `POST` | `/charges/:id/refund` | refund a charge |
| `POST` | `/payment-methods/setup` | begin saving a payment method (SetupIntent) |
| `GET`  | `/payment-methods/:id` | a saved method's displayable bits |
| `POST` | `/payouts` | marketplace payout to a connected payee |
| `GET`  | `/up` | health |

## Audit + email are network sinks

Subscription / invoice / charge changes enqueue an audit event on billing's **own**
outbox in the same transaction as the change. A background relay drains the outbox
and POSTs each batch to the audit service via `@iedora/audit-sdk` (and email via
`@iedora/email-sdk`, when wired). Billing never writes another service's DB — the
outbox message id is the idempotency key the sink dedupes on.

```
 charge tx                          audit service
 ┌────────────────┐  POST /events   ┌──────────────┐
 │ record charge   │ ──────────────▶ │ audit_log     │
 │  └ enqueue audit│                 └──────────────┘
 │ outbox relay ───┼─ POST /messages ▶ email service
 └────────────────┘                  (receipts, when wired)
```

## Run locally

```sh
bun install
BILLING_DATABASE_URL=postgres://iedora:iedora@localhost:5432/billing bun run migrate
BILLING_DATABASE_URL=... SERVICE_JWT_PUBLIC_KEY=... SERVICE_JWT_ISSUER=... \
  SERVICE_CLIENT_ID=... SERVICE_CLIENT_SECRET=... bun run dev
```

`bun install` needs a GitHub Packages read token for the `@iedora` scope:
`.npmrc` reads `NODE_AUTH_TOKEN` (e.g. `NODE_AUTH_TOKEN="$(gh auth token)" bun install`).
With an empty `STRIPE_SECRET_KEY` the service runs manual-only.

## Environment

| var | required | purpose |
|---|---|---|
| `BILLING_DATABASE_URL` | ✓ | the service's own database (runtime role) |
| `ADMIN_DATABASE_URL` | migrate-time | superuser on `/postgres`; creates the db + role in prod |
| `AUDIT_BASE_URL` / `AUTH_BASE_URL` | | audit sink + token-minting auth (else derived from sibling roles) |
| `SERVICE_CLIENT_ID` / `SERVICE_CLIENT_SECRET` | ✓ | mint service tokens from auth |
| `SERVICE_JWT_PUBLIC_KEY` / `SERVICE_JWT_ISSUER` | ✓ | verify inbound service tokens |
| `SERVICE_AUDIENCE` | | expected audience (default `iedora-internal`) |
| `BILLING_PERIOD` | | subscription period length (default `30d`) |
| `STRIPE_SECRET_KEY` | | enables the `stripe` kind (empty → manual-only) |
| `STRIPE_API_HOST` / `STRIPE_API_PORT` | | point at stripe-mock in dev |
| `BILLING_PORT` | | listen port (default `8083`) |

## Client SDK

The typed client lives in [`sdk/`](./sdk) and publishes as `@iedora/billing-sdk`
(see `.github/workflows/publish-sdk.yml`). Consumers:

```ts
import { BillingClient } from "@iedora/billing-sdk"
const billing = new BillingClient({ baseUrl, tokens }) // tokens: service-token source
await billing.subscribe({ tenantId, planCode })
```

## Deploy

`docker build --secret id=node_auth_token,env=NODE_AUTH_TOKEN -t iedora-billing .`
runs the TypeScript directly (Bun, no build step). Migrations run as a one-shot
(`bun run migrate`) before boot. Database-per-service: the runtime role connects to
`BILLING_DATABASE_URL` alone.

## Layout

```
src/
  index.ts                  compose root — Database, verifier, audit sink, relay
  app.ts                    createServiceApp + /billing route tree
  outbox.ts                 producer outbox/relay (messaging + audit-sdk/email-sdk)
  contracts.ts              vendored wire DTOs
  kinds.ts / stripe-gateway.ts   payment kinds (manual + Stripe)
  plans.ts                  code-defined plan registry
  features/<slice>/         subscribe · cancel · charge · refund · setup · payouts · …
migrations/                 subscriptions · invoices · outbox · charges · payouts · refunds
sdk/                        @iedora/billing-sdk — the typed client
```
