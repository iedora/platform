/**
 * @iedora/auth — public API.
 *
 * Server entry. Browser code imports from `@iedora/auth/client` instead
 * (the `better-auth/react` client lives there). Permissions taxonomy
 * (`statement`, `ac`, role definitions) is also re-exported here for
 * convenience; deep import `@iedora/auth/permissions` for the same
 * surface without pulling the server-only modules.
 */

export { getAuth, auth } from './auth'
export type { Auth, AuthSession } from './auth'

export {
  statement,
  ac,
  roles,
  member,
  admin,
  owner,
  iedoraAdmin,
  type Statement,
  type RoleKey,
} from './permissions'

export { schema } from './schema'
