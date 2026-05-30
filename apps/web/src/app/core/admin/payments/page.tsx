import { getTranslations } from 'next-intl/server'
import { requireScope } from '@iedora/product-core'
import { SCOPES } from '@iedora/auth/scopes'
import { listManualPayments, listProductPlans } from '@iedora/billing'
import { getTenantsByIds } from '@iedora/auth'
import { PRODUCTS } from '@iedora/brand'
import { AdminPage } from '@iedora/product-core/shared/ui/admin-page'
import { PaymentsAdmin } from './payments-admin'

// Plan catalogue is static — derive once at module load, not per request.
const PLAN_CATALOG = listProductPlans(PRODUCTS.menu)
const PLAN_PRICES: Record<string, number> = Object.fromEntries(
  PLAN_CATALOG.map((p) => [p.code, p.monthlyCents]),
)
const PLAN_LABELS: Record<string, string> = Object.fromEntries(
  PLAN_CATALOG.map((p) => [p.code, p.name]),
)

/**
 * Cross-tenant ledger of admin-recorded offline payments. Gated by
 * `staff:core:billing:manage` (held by iedora-admin only — held by
 * no tenant user). Server hydrates the initial list + tenant name
 * map; client owns the form + filter state.
 */
export default async function PaymentsPage() {
  // requireScope, i18n, and the payment ledger are independent — fan out.
  // 200 fits the foreseeable manual-payment ledger size; cross that and
  // we add pagination.
  const [, t, initialRows] = await Promise.all([
    requireScope(SCOPES.core.staff.billing.manage),
    getTranslations('Core.admin.payments'),
    listManualPayments({ limit: 200 }),
  ])

  // Hydrate tenant names in a single cross-DB round-trip (was N round-trips
  // via getTenantById in a Promise.all).
  const tenantIds = Array.from(new Set(initialRows.map((r) => r.tenantId)))
  const tenants = await getTenantsByIds(tenantIds)
  const tenantNames: Record<string, string> = {}
  for (const [id, tenant] of tenants) tenantNames[id] = tenant.name

  // Initial payload normalises Date → ISO and drops fields the client
  // doesn't render (`product`, `createdAt`, `createdByUserId`). At 200
  // rows that's ~10 KB shaved off the RSC payload — small, but worth it.
  const initialPayments = initialRows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    planCode: r.planCode,
    paidAt: r.paidAt.toISOString(),
    validMonths: r.validMonths,
    amountCents: r.amountCents,
    currency: r.currency,
    method: r.method,
    campaignTag: r.campaignTag,
    notes: r.notes,
  }))

  return (
    <AdminPage
      crumbs={[{ label: t('crumbAdmin'), href: '/core/admin', testId: 'admin' }]}
      title={t('title')}
      description={t('description')}
      data-test-id="admin-payments-page"
    >
      <PaymentsAdmin
        initialPayments={initialPayments}
        tenantNames={tenantNames}
        planPrices={PLAN_PRICES}
        planLabels={PLAN_LABELS}
      />
    </AdminPage>
  )
}
