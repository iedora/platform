import type { ChangeKind } from "@iedora/product-tutor/types"

// View type for the admin approvals queue. The read now lives in services/tutor;
// this shape is what the approval list + the BFF wrapper (lib/api/admin) consume.
export type AdminChange = {
  id: string
  tutorId: string
  tutorName: string
  tutorSlug: string | null
  kind: ChangeKind
  summary: string
  payload: Record<string, unknown>
  createdAt: Date
}
