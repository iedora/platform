import { iedoraAdminProfile, type PermissionProfile } from '@/features/auth/testing'

/**
 * The sessions admin UI is iedora-staff only — same profile as qr-codes.
 * Non-admin specs that just need "a session exists" should sign in via
 * `@/features/auth/testing` directly; this profile is for the admin
 * /dashboard/admin/sessions surface.
 */
export const sessionsAdminProfile: PermissionProfile = iedoraAdminProfile
