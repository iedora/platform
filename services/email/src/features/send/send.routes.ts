import { createInbox } from "@iedora/messaging"
import { type ServiceEnv, serviceAuth } from "@iedora/service-kit"
import { Hono } from "hono"
import { z } from "zod"

import type { EmailDeps } from "../../deps.ts"
import { recordDelivery } from "../deliveries/deliveries.query.ts"

// Vertical slice: DELIVERING transactional emails. Producers never send SMTP
// themselves — each producer's outbox relay POSTs queued emails here over a
// service token, and this slice sends them via @iedora/email, deduped by the
// producer's outbox message id so at-least-once redelivery sends once.
const emailMessage = z.object({
  to: z.string().min(1),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
})

const sendBody = z.object({
  messages: z
    .array(
      z.object({
        // Optional: a direct (non-relayed) send carries no outbox id, so it is
        // sent every time; a relayed send carries the id for dedupe.
        messageId: z.string().min(1).optional(),
        payload: emailMessage,
      }),
    )
    .min(1),
})

export function sendRoutes(deps: EmailDeps) {
  const inbox = createInbox(deps.database.root)
  // Body validated in-handler (no typed RPC client; nested record schemas blow
  // Hono's generic instantiation depth otherwise).
  return new Hono<ServiceEnv>().post("/messages", serviceAuth(deps.verifier), async (c) => {
    const parsed = sendBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400)
    // The producer that owns the service token — recorded as the delivery source.
    const source = c.get("clientId")
    for (const m of parsed.data.messages) {
      if (m.messageId) {
        // Mark + send in one transaction: if SMTP throws, the mark rolls back and
        // the producer's relay redelivers. Recording the delivery inside the
        // once-guard means a redelivery logs the send exactly once.
        await inbox.handleOnce({ messageId: m.messageId, topic: "email.send" }, async () => {
          await deps.mailer.send(m.payload)
          await recordDelivery(deps.database.db, {
            source,
            to: m.payload.to,
            subject: m.payload.subject,
            messageId: m.messageId,
          })
        })
      } else {
        // Direct (non-relayed) send: no outbox retry behind it, so a failed SMTP
        // send would otherwise vanish. Persist a `failed` row before surfacing the
        // error so `GET /deliveries?status=failed` reflects it. (The messageId
        // path above rolls back + the producer's relay redelivers instead.)
        try {
          await deps.mailer.send(m.payload)
        } catch (err) {
          await recordDelivery(deps.database.db, {
            source,
            to: m.payload.to,
            subject: m.payload.subject,
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          })
          throw err
        }
        await recordDelivery(deps.database.db, {
          source,
          to: m.payload.to,
          subject: m.payload.subject,
        })
      }
    }
    return c.json({ ok: true, count: parsed.data.messages.length })
  })
}
