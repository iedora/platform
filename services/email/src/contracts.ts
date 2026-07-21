import { z } from "zod"

// The email service's own wire format (vendored — no shared contracts package).
// Responses validate against these; any reader (email-sdk) consumes the inferred
// types. Mirrors the audit service's read contract.

export const emailStatus = z.enum(["sent", "failed"])
export type EmailStatus = z.infer<typeof emailStatus>

export const emailRecord = z.object({
  id: z.string(),
  at: z.string(), // RFC3339
  source: z.string(),
  tenantId: z.string().optional(),
  to: z.string(),
  subject: z.string(),
  status: z.string(),
  error: z.string().optional(),
  // The producer's outbox message id when the send was relayed (absent for a
  // direct send).
  messageId: z.string().optional(),
})
export type EmailRecord = z.infer<typeof emailRecord>

export const emailCursor = z.object({ at: z.string(), id: z.string() })
export type EmailCursor = z.infer<typeof emailCursor>

export const emailQueryResponse = z.object({
  deliveries: z.array(emailRecord),
  next: emailCursor.optional(),
})
export type EmailQueryResponse = z.infer<typeof emailQueryResponse>

// Query string accepted by GET /deliveries (filters + keyset cursor). Coerced
// from strings because it's a URL query. `limit` is clamped server-side.
export const emailFilter = z.object({
  source: z.string().optional(),
  status: z.string().optional(),
  to: z.string().optional(),
  tenant: z.string().optional(),
  before_at: z.string().optional(),
  before_id: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
})
export type EmailFilter = z.infer<typeof emailFilter>
