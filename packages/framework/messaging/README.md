# @iedora/messaging

Generic **transactional outbox + idempotent inbox** for Postgres/Kysely, so no
iedora service reimplements reliable messaging. At-least-once delivery via
`SELECT … FOR UPDATE SKIP LOCKED`, retries with jittered exponential backoff, and
dead-lettering.

- **Outbox** — write your data and an event in one transaction; a dispatcher
  delivers the event out-of-band. No lost or phantom events.
- **Dispatcher** — claims a batch with `FOR UPDATE SKIP LOCKED` (many workers
  scale horizontally without double-claiming), leases it, runs the topic's
  handler, and on failure retries with backoff or dead-letters.
- **Inbox** — because delivery is at-least-once, consumers dedup by message id;
  `handleOnce` processes + records in one transaction.

## Setup

Works with any Kysely (plugin-agnostic — raw snake_case sql internally). Merge the tables into your DB type
type and create them in a migration:

```ts
import type { MessagingDB } from "@iedora/messaging"
import { up } from "@iedora/messaging"

export interface DB extends MessagingDB { /* your tables */ }

// migration
export { up } from "@iedora/messaging" // creates outbox_message + inbox_message
```

## Produce (outbox)

```ts
import { enqueue } from "@iedora/messaging"

await db.transaction().execute(async (trx) => {
  await trx.insertInto("order").values(order).execute()
  await enqueue(trx, { topic: "order.placed", payload: { orderId: order.id } })
})
```

## Deliver (dispatcher)

```ts
import { createDispatcher } from "@iedora/messaging"

const dispatcher = createDispatcher(db, {
  handlers: {
    "order.placed": async (msg) => { await publish(msg.payload) }, // throw to retry
  },
  maxAttempts: 6,     // then dead-letter (dead_at set)
  baseMs: 5_000,      // backoff = random(0, min(cap, base * 2^(attempt-1)))
  capMs: 3_600_000,
})
dispatcher.start() // or await dispatcher.tick() to drain once
```

## Consume idempotently (inbox)

```ts
import { createInbox } from "@iedora/messaging"

const inbox = createInbox(db)
const processed = await inbox.handleOnce({ messageId: msg.id, topic: msg.topic }, async (trx) => {
  await trx.insertInto("processed_order").values(...).execute()
})
// processed === false → duplicate, already handled
```

## Guarantees

At-least-once: a crash after a handler succeeds but before the row is marked
delivered re-delivers, so **handlers must be idempotent** (that's what the inbox
is for). Dead-lettered rows (`dead_at IS NOT NULL`) are a diagnostic queue — their
count is a leading indicator that a consumer's SLO is broken.

## Test

`messaging/scripts/kit-test.ts` covers delivery, retry → dead-letter, and inbox
dedup against a throwaway Postgres (`DATABASE_URL=… bun scripts/kit-test.ts`).
