/**
 * @iedora/auth — public API.
 *
 * Server entry. Browser code imports from `@iedora/auth/client` instead
 * (the `better-auth/react` client lives there). The role-preset layer
 * (`STAFF_ROLE_PRESETS`, `TENANT_ROLE_PRESETS`, role literals) is also
 * re-exported here for convenience; deep import `@iedora/auth/role-presets`
 * for the same surface without pulling the server-only modules.
 */

export { getAuth, auth } from './auth/auth'
export type { Auth, AuthSession } from './auth/auth'

// Role presets + literals (UX shortcuts derived from `./rbac/scopes::SCOPES` —
// the only source of truth for the scope catalogue).
export {
  STAFF_ROLES,
  IEDORA_ADMIN_ROLE,
  IEDORA_SUPPORT_ROLE,
  TENANT_USER_FILTER,
  STAFF_ROLE_PRESETS,
  TENANT_ROLE_PRESETS,
  TENANT_ROLE_PRESET_KEYS,
  detectStaffPreset,
  detectTenantPreset,
  isStaffRole,
  type StaffRoleKey,
  type TenantRolePresetKey,
  type TenantUserFilter,
} from './rbac/role-presets'

export { schema } from './schema'
export { getCoreDb } from './db'

export {
  SESSION_COOKIE_NAME,
  SECURE_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAMES,
} from './cookies'

export { recordAudit } from './audit/audit'
export type { AuditInput, AuditOutcome } from './audit/audit'
export {
  CORE_AUDIT_EVENTS,
  type CoreAuditEvent,
  type AuditActor,
} from './audit/audit-events'

// Tenancy primitives (cross-product). Replace the former better-auth
// `organization` plugin surface.
export {
  createTenant,
  getTenantById,
  getTenantsByIds,
  listUserTenants,
  hasAnyTenant,
  searchTenants,
  type Tenant,
} from './tenants/tenants'
export {
  upsertMember,
  removeMember,
  listMembers,
  getMemberScopes,
  type TenantMember,
} from './tenants/tenant-members'
export {
  getActiveTenantId,
  setActiveTenant,
} from './auth/sessions'

// Staff (cross-tenant) primitives. Replace the former better-auth
// `admin` plugin surface — ban / impersonate / list-users live here
// now, working over the schema columns better-auth had configured.
export {
  getUserRole,
  setUserRole,
  getUserExtraScopes,
  setUserExtraScopes,
  getEffectiveUserScopes,
  getUserScopes,
  setUserScopes,
  userHasScope,
  isStaffUser,
  banUser,
  unbanUser,
  isBanned,
  impersonateUser,
  stopImpersonating,
  listUsers,
  getUser,
  type UserRow,
  type ListUsersFilter,
  type ListUsersResult,
} from './tenants/staff'
