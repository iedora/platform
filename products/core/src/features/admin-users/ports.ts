/**
 * Admin users slice ports.
 *
 * The gateway speaks domain shapes — `AdminUser`, `AdminUserSession` —
 * not better-auth's request/response envelopes. That lets use-cases be
 * tested against a fake gateway with no `headers()` plumbing, no
 * cookie state, no HTTP envelopes. The single production adapter
 * (`adapters/better-auth.ts`) is the only place `auth.api.*` is named.
 */

export type AdminUser = {
  id: string
  email: string
  name: string
  emailVerified: boolean
  /** Cross-tenant role on the user row. `null` for regular users. */
  role: string | null
  banned: boolean
  banReason: string | null
  /** Unix ms when the ban lifts. `null` for permanent bans. */
  banExpires: number | null
  createdAt: Date
  updatedAt: Date
}

export type AdminUserSession = {
  id: string
  token: string
  userId: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
  expiresAt: Date
  /** Set when an admin is impersonating this user. */
  impersonatedBy: string | null
}

export type ListUsersInput = {
  /** Free-text search across name + email. */
  q?: string
  /** Filter by ban state. `undefined` returns both. */
  banned?: boolean
  /** Filter by cross-tenant role on the user row. */
  role?: string | null
  /** 1-indexed page; pageSize is the gateway's responsibility. */
  page: number
  pageSize: number
  sortBy: 'createdAt' | 'name' | 'email'
  sortDirection: 'asc' | 'desc'
}

export type ListUsersResult = {
  users: ReadonlyArray<AdminUser>
  /** Total matching rows (across all pages). */
  total: number
  page: number
  pageSize: number
}

export interface AdminUsersGateway {
  listUsers(input: ListUsersInput): Promise<ListUsersResult>
  getUserById(input: { userId: string }): Promise<AdminUser | null>
  listUserSessions(input: { userId: string }): Promise<ReadonlyArray<AdminUserSession>>
  banUser(input: {
    userId: string
    reason?: string
    /** Seconds from now until the ban expires. Omit for permanent. */
    expiresInSec?: number
  }): Promise<void>
  unbanUser(input: { userId: string }): Promise<void>
  setRole(input: { userId: string; role: string | null }): Promise<void>
  revokeUserSessions(input: { userId: string }): Promise<void>
  revokeUserSession(input: { sessionToken: string }): Promise<void>
  impersonateUser(input: { userId: string }): Promise<void>
}

export type AdminUsersError =
  | { code: 'not-found' }
  | { code: 'self-target' }
  | { code: 'unknown'; message: string }
