import { EmailClient } from "@iedora/email-sdk"
import { type DeliveredMessage, enqueue } from "@iedora/messaging"
import type { Kysely } from "kysely"

import { config } from "./config"
import type { DB } from "./schema"
import { signServiceToken } from "./tokens"

export type EmailInput = {
  tenantId: string | null
  to: string
  subject: string
  html: string
  text: string
}

// Email is a generic microservice reached over the SDK: auth mints its own
// service token (it holds the signing key) and POSTs queued mail to the email
// service, which delivers via SMTP. No in-process transport here.
const email = new EmailClient({
  baseUrl: config.emailBaseUrl,
  tokens: {
    token: async () => (await signServiceToken("auth", config.serviceAudience, null)).token,
  },
})

/** Queue an email on the outbox. Pass the active transaction so it commits with
 *  the change that triggered it; the messaging dispatcher delivers it. */
export async function enqueueEmail(exec: Kysely<DB>, input: EmailInput): Promise<void> {
  await enqueue(exec, { topic: "email", payload: { ...input } })
}

/** Dispatcher handler for the "email" topic — delivers via the email service
 *  (email-sdk). The outbox message id is the idempotency key the service dedupes
 *  on, so at-least-once redelivery sends exactly once. */
export const emailHandler = (msg: DeliveredMessage): Promise<void> =>
  email.deliver([{ messageId: msg.id, payload: msg.payload }])
