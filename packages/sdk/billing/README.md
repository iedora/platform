# @iedora/billing-sdk

Typed client for the [`@iedora` billing service](../../../menu/services/billing).
Framework-agnostic — Node, Bun, and edge. No runtime dependencies (global
`fetch`); amounts are always integer minor units (cents).

```sh
bun add @iedora/billing-sdk   # or npm / pnpm
```

## Use

Construct a client with the service URL and a token source — anything with a
`token(): Promise<string>` that returns a bearer service token. Use
[`@iedora/auth-sdk`](https://github.com/iedora/auth/tree/main/sdk)'s
`ServiceTokenSource` (a cached client-credentials minter, imported from
`@iedora/auth-sdk/tokens`); it satisfies the `TokenSource` interface directly.

```ts
import { BillingClient } from "@iedora/billing-sdk"
import { ServiceTokenSource } from "@iedora/auth-sdk/tokens"

const billing = new BillingClient({
  baseUrl: "https://billing.iedora.com",
  tokens: new ServiceTokenSource(AUTH_BASE_URL, CLIENT_ID, CLIENT_SECRET),
})

// One-off charge. Everything explicit: name the `kind`, and the `mode` for stripe.
// A marketplace split happens only when BOTH payee and feeRate are given.
const charge = await billing.createCharge({
  product: "lesson",
  payer: "org_1",
  payee: "tutor_9",
  amountCents: 5000,
  currency: "USD",
  kind: "stripe",
  mode: "intent", // client confirms; charge.clientSecret is returned
  feeRate: 0.2,
})

const same = await billing.getCharge(charge.id) // null on 404

// Save a card for later off-session charges. `kind` is REQUIRED (only stripe supports setup).
const setup = await billing.setupPaymentMethod({ kind: "stripe", customer: "cus_123" })
//    setup.clientSecret · setup.customer

// Marketplace payout to a payee. RECORD-ONLY: books it as `pending`; execution
// (the money movement) is a later step, so there's no `kind` here.
await billing.createPayout({
  payee: "tutor_9",
  amountCents: 4000,
  currency: "USD",
  product: "lesson",
})

// Refund (full unless amountCents given).
await billing.refundCharge(charge.id, { reason: "requested_by_customer" })
```

Errors are typed and carry the service's error code:

```ts
import { BillingError } from "@iedora/billing-sdk"

try {
  await billing.createCharge(input)
} catch (e) {
  if (e instanceof BillingError && e.code === "invalid_for_kind") { /* … */ }
}
```

## API

`new BillingClient({ baseUrl, tokens, fetch? })` →

- `createCharge(input)` — `POST /billing/charges`
- `getCharge(id)` — `GET /billing/charges/:id` (null on 404)
- `createPayout(input)` — `POST /billing/payouts` (record-only; books `pending`)
- `setupPaymentMethod(input)` — `POST /billing/payment-methods/setup`
- `getPaymentMethod(id)` — `GET /billing/payment-methods/:id` (a saved card's displayable bits)
- `refundCharge(id, input)` — `POST /billing/charges/:id/refund`
- `subscribe(input)` — `POST /billing/subscribe` (activate/change a tenant's plan)
- `cancel(input)` — `POST /billing/cancel` (end a tenant's subscription for a product)
- `listSubscriptions(tenant)` — `GET /billing/subscriptions?tenant=`
- `listInvoices(query)` — `GET /billing/invoices?…`
- `recordPayment(input)` — `POST /billing/invoices` (record a manual/cash payment as a paid invoice)

Every method is authed with `Bearer ${await tokens.token()}` and throws a
`BillingError` on any non-2xx response.

Typecheck: `bun run typecheck`.
