import "server-only"

import { apiJson } from "@iedora/product-tutor/api"
import type { AdminChangeDTO } from "@iedora/product-tutor/contracts/admin"
import type { ChangeKind } from "@iedora/product-tutor/types"

import type { AdminChange } from "@iedora/product-tutor/features/admin/admin.queries"

// The admin approvals queue, from the service (admin gate enforced server-side).
export async function listPendingChanges(): Promise<AdminChange[]> {
  const { changes } = await apiJson<{ changes: AdminChangeDTO[] }>("/api/admin/pending-changes")
  return changes.map((c) => ({
    id: c.id,
    tutorId: c.tutorId,
    tutorName: c.tutorName,
    tutorSlug: c.tutorSlug,
    kind: c.kind as ChangeKind,
    summary: c.summary,
    payload: c.payload,
    createdAt: new Date(c.createdAt),
  }))
}

export const approveChange = (changeId: string) =>
  apiJson<{ approved: true }>(`/api/admin/changes/${encodeURIComponent(changeId)}/approve`, {
    method: "POST",
  })

export const rejectChange = (changeId: string, note?: string) =>
  apiJson<{ rejected: true }>(`/api/admin/changes/${encodeURIComponent(changeId)}/reject`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note }),
  })
