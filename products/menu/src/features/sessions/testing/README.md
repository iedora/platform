# sessions/testing — slice E2E surface

No own seeds — the canonical session-row insertion lives in
`@/features/auth/testing/signInAs`. This module holds the routes +
admin profile for the `/dashboard/admin/sessions` surface.

- `sessionsAdminProfile` — re-exports `iedoraAdminProfile` (sessions
  admin is gated by `requireIedoraAdmin`).
- `sessionsRoutes.admin` — `/dashboard/admin/sessions`.
