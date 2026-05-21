# auth/testing — slice E2E surface

Public test surface for the auth slice. Importable from
`src/features/&#42;/e2e/` and `tests/e2e/journeys/` (menu CLAUDE.md rule 15).
`'server-only'`; production code (anything outside `e2e/` or `testing/`)
will fail lint if it tries to import.

## Exports

- `signInAs(context, { email, name, profile, organizationId? })` —
  inserts a `menu.session` row + injects the JWE pointer cookie. Mirrors
  `/api/auth/callback` so the production DAL sees a real session.
- `signOut(context)` — drops the cookie.
- `iedoraAdminProfile` — `[iedora-admin]` role + every scope in
  `../scopes.ts` (matches the production bundle expansion).
- `memberProfile` — authenticated, zero scopes. Use to assert denial.
- `authRoutes` — `/api/auth/{login,callback,logout}` constants.

## Why it lives here

`signInAs` is structurally identical to the OIDC callback: same cookie
format, same row layout. If the production callback changes, so must
this helper. Co-locating keeps that contract enforceable.

The `PermissionProfile` shape is derived from `../scopes.ts` — adding a
new atomic scope lifts every spec that uses `iedoraAdminProfile` for
free.
