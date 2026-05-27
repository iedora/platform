/**
 * The cross-tenant staff role literal. Better-auth's `admin` plugin
 * stores this in `user.role`; the AC binding in `@iedora/auth/permissions`
 * grants every (resource, verb) in the statement to anyone carrying it.
 *
 * Framework-free — imported from server use-cases AND tests, MUST NOT
 * depend on `next` or `server-only`.
 */
export const IEDORA_ADMIN_ROLE = 'iedora-admin'
