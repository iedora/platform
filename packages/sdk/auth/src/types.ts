/** Verified access-token claims. `sub` is the user id, `tenant` the product slug,
 *  `sid` the session family, `org`/`roles` the active organization + roles, `mcp`
 *  a pending forced password change, `amr` the auth methods used. */
export type AuthClaims = {
  sub: string
  tenant: string
  email?: string
  name?: string | null
  sid?: string
  org?: string | null
  roles?: string[]
  mcp?: boolean
  amr?: string[]
  iss: string
  aud: string | string[]
  exp: number
  iat: number
}

export type AuthUser = {
  id: string
  email: string
  name: string | null
}

export type TokenBundle = {
  accessToken: string
  refreshToken: string
  tokenType: "Bearer"
  expiresIn: number
}

/** What register/login return: the user plus a fresh token bundle. */
export type AuthSession = { user: AuthUser } & TokenBundle

export type ProviderOption = { providerId: string; kind: "password" | "oauth2" }

export type Role = "owner" | "admin" | "member"

/** A device/session as shown to the user (one per refresh family). */
export type SessionView = {
  family: string
  ip: string | null
  userAgent: string | null
  createdAt: string
  lastActiveAt: string
  expiresAt: string
  current: boolean
}

/** An organization the caller belongs to, with their role. */
export type Organization = { id: string; slug: string; name: string; role: Role }

export type OrgMember = {
  userId: string
  email: string
  name: string | null
  role: Role
  joinedAt: string
}

/** The `whoami` response, with a live `mustChangePassword`. */
export type WhoAmI = {
  sub: string
  email: string | null
  name: string | null
  tenant: string
  org: string | null
  roles: string[]
  mustChangePassword: boolean
  exp: number
}

/** Result of switching the active org: a fresh access token for the new org. */
export type SwitchResult = { accessToken: string; expiresIn: number; org: string; roles: Role[] }

/* ------------------------------ manage (admin) --------------------------- */

export type AdminUser = {
  id: string
  email: string
  name: string | null
  banned: boolean
  mustChangePassword: boolean
  emailVerified: boolean
  createdAt: string
  orgCount: number
}

export type AdminUserDetail = AdminUser & {
  memberships: { organizationId: string; slug: string; name: string; role: string }[]
}

export type AdminSession = {
  family: string
  ip: string | null
  userAgent: string | null
  createdAt: string
  lastActiveAt: string
  expiresAt: string
  revoked: boolean
}

export type OrgWithOwner = {
  id: string
  slug: string
  name: string
  createdAt: string
  owner: { id: string; email: string; name: string | null } | null
}

export type ServiceTokenResponse = { accessToken: string; tokenType: "Bearer"; expiresIn: number }

/** Thrown by the client on a non-2xx response, carrying the service's error code. */
export class AuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code)
    this.name = "AuthError"
  }
}
