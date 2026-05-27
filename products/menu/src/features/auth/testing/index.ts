import 'server-only'

/**
 * Public test surface of the auth slice. Importable only from
 * `src/features/*\/e2e/` and `tests/e2e/journeys/` (rule 15). E2E
 * specs that need a signed-in user drive the sign-in/sign-up UI
 * directly; per-test PermissionProfile scaffolding is intentionally
 * absent — the cookie set by better-auth IS the source of truth.
 */

export { authRoutes } from './routes'
