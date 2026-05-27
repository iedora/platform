import { requireScope } from '@iedora/product-core'
import { SCOPES } from '@iedora/auth/scopes'
import { AdminShell } from '@iedora/product-core/shared/ui/admin-shell'

/**
 * Admin chrome — runs at /core/admin/*. Gates on the
 * `staff:core:admin:read` scope (held by every staff role, missing
 * for tenant users). Each nested page tightens via `requireScope`
 * for the narrower verb the page touches (defence-in-depth +
 * Next 16 caches layouts).
 */
export default async function CoreAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireScope(SCOPES.core.staff.admin.read)
  return (
    <AdminShell
      userEmail={session.user.email}
      userRole={session.user.role ?? null}
    >
      {children}
    </AdminShell>
  )
}
