import 'server-only'

// Public server surface of the admin-users slice. Adapters + use-cases
// stay slice-private; routes call the barrel for the gateway factory +
// the use-case functions, and reach into ./actions or ./ui via the
// declared subpath exports in package.json (the 'use server' / 'use
// client' boundaries don't traverse barrels).

export type {
  AdminUser,
  AdminUserSession,
  AdminUsersGateway,
  ListUsersInput,
  ListUsersResult,
} from './ports'

export { betterAuthAdminUsersGateway } from './adapters/better-auth'
export { listUsers } from './use-cases/list-users'
export { getUserById } from './use-cases/get-user'
export { listUserSessions } from './use-cases/list-user-sessions'
export {
  ALLOWED_CROSS_TENANT_ROLES,
  type CrossTenantRole,
} from './use-cases/set-role'
