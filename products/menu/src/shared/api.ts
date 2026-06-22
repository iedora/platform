import 'server-only'
import { apiJson, ApiError, MENU_URL } from '@iedora/api-client'
import { menu } from '@iedora/api-client/menu-rpc'
import type {
  Analytics,
  AuditRecord,
  CategoryUpdate,
  DailyPoint,
  IdentityPatch,
  ImportPayload,
  Invoice,
  ItemWrite,
  MenuNode,
  MenuSummary,
  MenuUpdate,
  PlanLimits,
  PresignedUpload,
  PublicMenuPayload,
  QRCode,
  Restaurant,
  RestaurantRef,
  RestaurantSummary,
  StaffRestaurantRow,
  Subscription,
  TenantWithOwner,
  UploadTarget,
} from '@iedora/contracts'

/**
 * Typed client for the menu service — the menu product's ONLY data surface.
 * Payload types are the SHARED @iedora/contracts schemas (the same ones the
 * service validates against); one function per endpoint, all server-side via
 * the Bearer-attaching `apiJson` (which refreshes once on 401).
 */

// Re-exported so existing imports from this module keep resolving; the
// definitions now live in @iedora/contracts (single source of truth).
export type {
  Analytics,
  AuditRecord,
  CategoryNode,
  CategoryUpdate,
  DailyPoint,
  Invoice,
  Subscription,
  TenantWithOwner,
  IdentityPatch,
  ItemNode,
  ItemWrite,
  LocalizedText,
  MenuNode,
  MenuSummary,
  MenuUpdate,
  PlanLimits,
  PresignedUpload,
  PublicCategory,
  PublicItem,
  PublicMenu,
  PublicMenuPayload,
  PublicVariant,
  QRCode,
  Restaurant,
  RestaurantRef,
  RestaurantSummary,
  StaffOverview,
  StaffRestaurantRow,
  TextFields,
  Theme,
  UploadTarget,
  Variant,
} from '@iedora/contracts'

// --- tenant-level ---

export function listRestaurants() {
  return apiJson<{ restaurants: RestaurantSummary[] }>('/api/restaurants')
}

export function createRestaurant(name: string, defaultLanguage: string) {
  return apiJson<Restaurant>('/api/restaurants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, defaultLanguage }),
  })
}

export function getPlan() {
  return apiJson<PlanLimits>('/api/plan')
}

export async function getAnalytics(range: string): Promise<Analytics> {
  // Typed Hono RPC call — path + query are checked against the menu
  // service's route definitions (no hand-built URL).
  const res = await menu.api.analytics.$get({ query: { range } })
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return (await res.json()) as Analytics
}

export async function getMonthlyViews(): Promise<{ count: number }> {
  const res = await menu.api.views.month.$get()
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return res.json()
}

// --- restaurant-scoped ---

const r = (slug: string) => `/api/restaurants/${encodeURIComponent(slug)}`

export function getRestaurant(slug: string) {
  return apiJson<{ restaurant: Restaurant; menus: MenuSummary[] }>(r(slug))
}

export function updateIdentity(slug: string, patch: IdentityPatch) {
  return apiJson<Restaurant>(r(slug), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}


export function renameSlug(slug: string, next: string) {
  return apiJson<void>(`${r(slug)}/slug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: next }),
  })
}

export function completeOnboarding(slug: string) {
  return apiJson<void>(`${r(slug)}/complete-onboarding`, { method: 'POST' })
}

export function getMenuTree(slug: string) {
  return apiJson<{
    menus: MenuNode[]
    defaultLanguage: string
    supportedLanguages: string[]
  }>(`${r(slug)}/tree`)
}

// --- builder ---

const json = (body: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function createMenu(slug: string, name: string) {
  return apiJson<{ id: string }>(`${r(slug)}/menus`, { method: 'POST', ...json({ name }) })
}

export function updateMenu(slug: string, menuId: string, update: MenuUpdate) {
  return apiJson<void>(`${r(slug)}/menus/${menuId}`, { method: 'PATCH', ...json(update) })
}

export function deleteMenu(slug: string, menuId: string) {
  return apiJson<void>(`${r(slug)}/menus/${menuId}`, { method: 'DELETE' })
}

export function reorderCategories(slug: string, menuId: string, orderedIds: string[]) {
  return apiJson<void>(`${r(slug)}/menus/${menuId}/category-order`, {
    method: 'PUT',
    ...json({ orderedIds }),
  })
}

export function createCategory(slug: string, menuId: string, name: string) {
  return apiJson<{ id: string }>(`${r(slug)}/menus/${menuId}/categories`, {
    method: 'POST',
    ...json({ name }),
  })
}

export function updateCategory(slug: string, categoryId: string, update: CategoryUpdate) {
  return apiJson<void>(`${r(slug)}/categories/${categoryId}`, { method: 'PATCH', ...json(update) })
}

export function deleteCategory(slug: string, categoryId: string) {
  return apiJson<void>(`${r(slug)}/categories/${categoryId}`, { method: 'DELETE' })
}

export function reorderItems(slug: string, categoryId: string, orderedIds: string[]) {
  return apiJson<void>(`${r(slug)}/categories/${categoryId}/item-order`, {
    method: 'PUT',
    ...json({ orderedIds }),
  })
}

export function createItem(slug: string, categoryId: string, item: ItemWrite) {
  return apiJson<{ id: string }>(`${r(slug)}/categories/${categoryId}/items`, {
    method: 'POST',
    ...json(item),
  })
}

export function updateItem(slug: string, itemId: string, item: ItemWrite) {
  return apiJson<void>(`${r(slug)}/items/${itemId}`, { method: 'PATCH', ...json(item) })
}

export function deleteItem(slug: string, itemId: string) {
  return apiJson<void>(`${r(slug)}/items/${itemId}`, { method: 'DELETE' })
}

// --- uploads (presign → browser PUT → commit) ---

export function presignUpload(
  slug: string,
  target: UploadTarget,
  contentType: string,
  itemId?: string,
) {
  return apiJson<PresignedUpload>(`${r(slug)}/uploads/presign`, {
    method: 'POST',
    ...json({ target, contentType, itemId }),
  })
}

export function commitUpload(slug: string, target: UploadTarget, key: string, itemId?: string) {
  return apiJson<{ url: string }>(`${r(slug)}/uploads/commit`, {
    method: 'POST',
    ...json({ target, key, itemId }),
  })
}

export function clearUpload(slug: string, target: UploadTarget, itemId?: string) {
  return apiJson<void>(`${r(slug)}/uploads/clear`, { method: 'POST', ...json({ target, itemId }) })
}

// --- public (unauthenticated; SSR of the guest menu page) ---

export function getPublicMenu(slug: string, lang?: string, acceptLanguage?: string) {
  const qs = lang ? `?lang=${encodeURIComponent(lang)}` : ''
  return apiJson<PublicMenuPayload>(
    `${MENU_URL}/public/r/${encodeURIComponent(slug)}${qs}`,
    acceptLanguage ? { headers: { 'Accept-Language': acceptLanguage } } : {},
  )
}

export function resolveQRCode(code: string) {
  return apiJson<{ slug: string }>(`${MENU_URL}/public/qr/${encodeURIComponent(code)}`)
}

// --- staff (cross-tenant; requires the staff role) ---

export function staffDirectory(q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : ''
  return apiJson<{ restaurants: StaffRestaurantRow[] }>(`/api/staff/directory${qs}`)
}

/** Aggregated detail for the admin restaurant pages: the record + menus +
 * 14-day trend, the tenant's billing (subscriptions + invoices), and the
 * restaurant's audit trail. Billing/audit are best-effort on the service. */
export type StaffRestaurantFull = {
  restaurant: StaffRestaurantRow
  menus: MenuSummary[]
  trend: DailyPoint[]
  billing: { subscriptions: Subscription[]; invoices: Invoice[] }
  audit: AuditRecord[]
  tenant: TenantWithOwner | null // tenant + owner user (null if the auth read failed/absent)
}

export function staffRestaurantDetail(id: string) {
  return apiJson<StaffRestaurantFull>(`/api/staff/restaurants/${encodeURIComponent(id)}`)
}

/** Staff identity override — a privileged rename of a restaurant's friendly name,
 * cross-tenant by id (the service gates STAFF_ROLE + audits it). */
export function staffUpdateRestaurant(id: string, patch: { name: string }) {
  return apiJson<{ restaurant: Restaurant }>(`/api/staff/restaurants/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    ...json(patch),
  })
}

/** Tenants (with owners) for the admin "assign to tenant" picker. */
export function staffListTenants() {
  return apiJson<{ tenants: TenantWithOwner[] }>('/api/staff/tenants')
}

/** Provision a restaurant under an existing tenant (`tenantId`) or a brand-new
 * one (`newTenantName`, owned by the acting admin). Always lands on the free plan. */
export function staffCreateRestaurant(input: {
  name: string
  defaultLanguage?: string
  tenantId?: string
  newTenantName?: string
}) {
  return apiJson<{ restaurant: Restaurant }>('/api/staff/restaurants', {
    method: 'POST',
    ...json(input),
  })
}

/** Provision a restaurant + its full menu from a pasted JSON document. The
 * payload's optional `tenant` name creates a new tenant; otherwise `tenantId`
 * (an existing tenant) is used. */
export function staffImportRestaurant(input: { tenantId?: string; payload: ImportPayload }) {
  return apiJson<{ restaurant: Restaurant }>('/api/staff/restaurants/import', {
    method: 'POST',
    ...json(input),
  })
}

export function listQRCodes() {
  return apiJson<{ codes: QRCode[] }>('/api/staff/qr-codes')
}

export function createQRCodes(input: {
  code?: string
  count?: number
  restaurantId?: string
  label?: string
}) {
  return apiJson<{ inserted: number }>('/api/staff/qr-codes', { method: 'POST', ...json(input) })
}

export function bindQRCode(code: string, restaurantId: string) {
  return apiJson<void>(`/api/staff/qr-codes/${encodeURIComponent(code)}/bind`, {
    method: 'POST',
    ...json({ restaurantId }),
  })
}

export function unbindQRCode(code: string) {
  return apiJson<void>(`/api/staff/qr-codes/${encodeURIComponent(code)}/unbind`, {
    method: 'POST',
  })
}

export function labelQRCode(code: string, label: string) {
  return apiJson<void>(`/api/staff/qr-codes/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    ...json({ label }),
  })
}

export function deleteQRCode(code: string) {
  return apiJson<void>(`/api/staff/qr-codes/${encodeURIComponent(code)}`, { method: 'DELETE' })
}

export function listRestaurantRefs() {
  return apiJson<{ restaurants: RestaurantRef[] }>('/api/staff/restaurants')
}
