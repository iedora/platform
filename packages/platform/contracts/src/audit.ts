import { z } from "zod";

// The audit service wire format. The audit service validates its
// responses against these; the admin BFF + any reader consume the inferred types.

export const auditOutcome = z.enum(["success", "failure", "unknown"]);
export type AuditOutcome = z.infer<typeof auditOutcome>;

export const auditRecord = z.object({
  id: z.string(),
  at: z.string(), // RFC3339
  source: z.string(),
  tenantId: z.string().optional(),
  action: z.string(),
  outcome: z.string(),
  actorType: z.string(),
  actorId: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  sessionId: z.string().optional(),
  traceId: z.string().optional(),
  meta: z.unknown(),
});
export type AuditRecord = z.infer<typeof auditRecord>;

export const auditCursor = z.object({ at: z.string(), id: z.string() });
export type AuditCursor = z.infer<typeof auditCursor>;

export const auditQueryResponse = z.object({
  events: z.array(auditRecord),
  next: auditCursor.optional(),
});
export type AuditQueryResponse = z.infer<typeof auditQueryResponse>;

// Query string accepted by GET /obs/events (filters + keyset cursor). `limit`
// is coerced from the string query param; defaulting/clamping is the server's job.
export const auditFilter = z.object({
  tenant: z.string().optional(),
  actor: z.string().optional(),
  action: z.string().optional(), // prefix match
  outcome: z.string().optional(),
  source: z.string().optional(),
  target: z.string().optional(), // exact target_id (e.g. a restaurant id)
  before_at: z.string().optional(),
  before_id: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});
export type AuditFilter = z.infer<typeof auditFilter>;
