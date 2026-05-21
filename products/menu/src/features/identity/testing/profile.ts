import type { PermissionProfile } from '@/features/auth/testing'

/**
 * Identity-slice spec profiles. Identity surfaces are gated by membership,
 * not by scope — so the profile is just "any authenticated user". Keep
 * the type alias here for symmetry across slices.
 */
export const orgMemberProfile: PermissionProfile = {
  roles: [],
  permissions: [],
}
