import { z } from "zod";

// The auth service wire format. The token response shape matches what
// the frontend's @iedora/api-client already decodes (TokenResponse), so the
// Hono auth service stays drop-in compatible with the live frontend.

export const tokenResponse = z.object({
  accessToken: z.string(),
  expiresAt: z.string(), // RFC3339
  // The refresh token is returned in the BODY (auth-sdk TokenBundle style); the
  // BFF owns the cookie. `refreshExpiresAt` lets the BFF set the cookie lifetime.
  refreshToken: z.string(),
  refreshExpiresAt: z.string(), // RFC3339
  userId: z.string(),
  tenantId: z.string().optional(),
  // Set after a sign-in when an admin has flagged the account: the client must
  // route the user through a "set a new password" screen before continuing.
  mustChangePassword: z.boolean().optional(),
});
export type TokenResponse = z.infer<typeof tokenResponse>;

export const loginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequest>;

// Self-service / forced password change (user-authed). `currentPassword` is
// required for a voluntary change but omitted on a forced change (the user just
// authenticated at login). New password mirrors the reset policy (>= 12).
export const changePasswordRequest = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(12).max(200),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequest>;

// Admin sets a temporary password for a user (service-only). The user is forced
// to change it at next login.
export const adminSetPasswordRequest = z.object({
  password: z.string().min(12).max(200),
});
export type AdminSetPasswordRequest = z.infer<typeof adminSetPasswordRequest>;

export const registerRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});
export type RegisterRequest = z.infer<typeof registerRequest>;

// Forgot/reset password. The request only needs an email; the server always
// responds identically whether or not the account exists (no enumeration).
export const forgotPasswordRequest = z.object({
  email: z.string().email(),
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequest>;

// Reset confirmation: the opaque token from the emailed link + the new password
// (same policy as registration). The token is the only secret that authorizes
// the change.
export const resetPasswordRequest = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequest>;

export const createTenantRequest = z.object({ name: z.string().min(1) });
export type CreateTenantRequest = z.infer<typeof createTenantRequest>;

export const tenant = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
});
export type Tenant = z.infer<typeof tenant>;

// A tenant joined to its owner user — the service-only read behind
// GET /auth/tenants/:id, used by the admin BFF to name a restaurant's owner.
export const ownerUser = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
});
export type OwnerUser = z.infer<typeof ownerUser>;

export const tenantWithOwner = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  owner: ownerUser,
});
export type TenantWithOwner = z.infer<typeof tenantWithOwner>;

// Service-only list of tenants joined to their owners, behind
// GET /auth/admin/tenants. Feeds the admin "assign to tenant" picker via the
// menu BFF.
export const tenantList = z.object({ tenants: z.array(tenantWithOwner) });
export type TenantList = z.infer<typeof tenantList>;

// Service-only admin create: provision a tenant owned by `ownerUserId`. Called
// by the menu BFF when staff create or import a restaurant under a brand-new
// tenant (the acting admin becomes the owner). Distinct from the user-authed
// POST /auth/tenants, which owns the tenant by the caller.
export const adminCreateTenantRequest = z.object({
  name: z.string().trim().min(1).max(120),
  ownerUserId: z.string().min(1),
});
export type AdminCreateTenantRequest = z.infer<typeof adminCreateTenantRequest>;

// Transfer a tenant to a brand-new user, created with this password; the user
// becomes the tenant's owner so the tenant + its restaurants move to them.
export const adminTransferNewOwnerRequest = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(200),
});
export type AdminTransferNewOwnerRequest = z.infer<typeof adminTransferNewOwnerRequest>;

// --- admin user management (read-only), behind GET /auth/admin/users* ---
// Service-only reads the menu BFF fans out to for the staff "Users" CRM. Dates
// are RFC3339 strings on the wire. `ip` is the raw client IP captured going
// forward (NULL on older sessions); `tenantCount` lets the list show reach
// without a second round-trip.

export const adminUser = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.string().nullable(),
  banned: z.boolean(),
  banReason: z.string().nullable(),
  banExpiresAt: z.string().nullable(),
  emailVerifiedAt: z.string().nullable(),
  createdAt: z.string(),
  passwordChangedAt: z.string(),
  mustChangePassword: z.boolean(),
  tenantCount: z.number().int(),
});
export type AdminUser = z.infer<typeof adminUser>;

export const adminUserMembership = z.object({
  tenantId: z.string(),
  role: z.string(),
});
export type AdminUserMembership = z.infer<typeof adminUserMembership>;

export const adminUserDetail = adminUser.extend({
  memberships: z.array(adminUserMembership),
});
export type AdminUserDetail = z.infer<typeof adminUserDetail>;

export const adminUserSession = z.object({
  id: z.string(),
  familyId: z.string(),
  tenantId: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  issuedAt: z.string(),
  expiresAt: z.string(),
  absoluteExpiresAt: z.string(),
  revokedAt: z.string().nullable(),
  // Live (not revoked, not past either expiry) at query time.
  current: z.boolean(),
});
export type AdminUserSession = z.infer<typeof adminUserSession>;

export const adminUserList = z.object({ users: z.array(adminUser) });
export type AdminUserList = z.infer<typeof adminUserList>;

export const adminUserSessionList = z.object({ sessions: z.array(adminUserSession) });
export type AdminUserSessionList = z.infer<typeof adminUserSessionList>;

export const whoamiResponse = z.object({
  userId: z.string(),
  tenantId: z.string().optional(),
  roles: z.array(z.string()),
  email: z.string().optional(),
  // Live force-change flag (read from the DB, not the token) — the dashboard
  // guard sends the user to the change-password screen while it's true.
  mustChangePassword: z.boolean().optional(),
});
export type WhoamiResponse = z.infer<typeof whoamiResponse>;

export const serviceTokenResponse = z.object({
  accessToken: z.string(),
  expiresAt: z.string(),
  tokenType: z.literal("Bearer"),
});
export type ServiceTokenResponse = z.infer<typeof serviceTokenResponse>;

// Access-token claims (EdDSA).
export const accessClaims = z.object({
  sub: z.string(),
  tenant: z.string().optional(),
  org: z.string().optional(),
  sid: z.string().optional(),
  roles: z.array(z.string()).default([]),
  email: z.string().optional(),
  // must-change-password — lets the dashboard guard short-circuit locally.
  mcp: z.boolean().optional(),
  typ: z.literal("access"),
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
});
export type AccessClaims = z.infer<typeof accessClaims>;
