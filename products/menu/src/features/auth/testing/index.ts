import 'server-only'

/**
 * Public test surface of the auth slice. Importable only from
 * `src/features/&#42;/e2e/` and `tests/e2e/journeys/` (rule 15).
 */

export { signInAs, signOut } from './sign-in'
export type { SignedInUser, SignInInput } from './sign-in'
export { iedoraAdminProfile, memberProfile } from './profile'
export type { PermissionProfile } from './profile'
export { authRoutes } from './routes'
