# @iedora/audit-sdk

Typed client + emitter contracts for the **@iedora audit service**.

Producers emit action-events through an `Auditor` and enqueue them on their own
outbox. A relay drains the outbox and pushes each batch to the audit service
over HTTP via `AuditClient` — the audit service never touches a producer's DB.

```ts
import { AuditClient } from "@iedora/audit-sdk"

const audit = new AuditClient({
  baseUrl: "https://audit.iedora.com",
  tokens: { token: () => minter.get() }, // bearer service token
})

await audit.ingest([{ messageId: row.id, payload: row.payload }])
```

Exports the wire contracts — `AuditEvent`, `AuditActor`, `AuditOutcome`,
`Auditor`, `AuditDelivery`, `AuditSink`, `AUDIT_TOPIC` — plus `AuditClient` and
`AuditError`. Dependency-free; runs in Node, Bun, and edge runtimes.
