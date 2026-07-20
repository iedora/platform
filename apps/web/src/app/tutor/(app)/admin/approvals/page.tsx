import { ApprovalList } from "@iedora/product-tutor/features/admin/components/approval-list"
import { listPendingChanges } from "@iedora/product-tutor/api/admin"
import { requireAdmin } from "@iedora/product-tutor/auth/session"

export default async function AdminApprovalsPage() {
  await requireAdmin()
  const changes = await listPendingChanges()

  return (
    <div className="mx-auto max-w-2xl p-4 pb-8 sm:p-6">
      <h1 className="mb-1 text-xl font-semibold">Pending changes</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Tutor edits waiting for approval. Approving publishes the change to their public page.
      </p>
      <ApprovalList changes={changes} />
    </div>
  )
}
