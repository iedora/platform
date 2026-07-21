import { z } from "zod"

// Wire contract for the admin approvals queue. Admin-gated (allowlist or the admin
// table), enforced server-side against the Bearer principal's email.

export const rejectChangeInput = z.object({ note: z.string().trim().max(400).optional() })
export type RejectChangeInput = z.infer<typeof rejectChangeInput>

export interface AdminChangeDTO {
  id: string
  tutorId: string
  tutorName: string
  tutorSlug: string | null
  kind: string
  summary: string
  payload: Record<string, unknown>
  createdAt: string
}
