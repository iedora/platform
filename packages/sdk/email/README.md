# @iedora/email-sdk

Typed client for the **@iedora email service**.

Producers enqueue transactional emails on their own outbox under `EMAIL_TOPIC`.
A relay drains the outbox and pushes each batch to the email service over HTTP
via `EmailClient`, which sends them over SMTP (`@iedora/email`). The email
service never touches a producer's DB.

```ts
import { EmailClient } from "@iedora/email-sdk"

const email = new EmailClient({
  baseUrl: "https://email.iedora.com",
  tokens: { token: () => minter.get() }, // bearer service token
})

// direct send
await email.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>", text: "hi" })

// relay path (batch drained from an outbox)
await email.deliver([{ messageId: row.id, payload: row.payload }])
```

Exports the wire contracts — `EmailMessage`, `EmailDelivery`, `EmailSink`,
`EMAIL_TOPIC` — plus `EmailClient` and `EmailError`. Dependency-free; runs in
Node, Bun, and edge runtimes.
