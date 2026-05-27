import type {
  AdminUser,
  AdminUserSession,
  AdminUsersGateway,
  ListUsersInput,
  ListUsersResult,
} from '../ports'

export type FakeGatewayState = {
  users: AdminUser[]
  sessions: AdminUserSession[]
  calls: {
    banUser: Array<{ userId: string; reason?: string; expiresInSec?: number }>
    unbanUser: Array<{ userId: string }>
    setRole: Array<{ userId: string; role: string | null }>
    revokeUserSessions: Array<{ userId: string }>
    revokeUserSession: Array<{ sessionToken: string }>
    impersonateUser: Array<{ userId: string }>
  }
}

/**
 * Pure in-memory gateway for use-case tests. Mirrors the contract of
 * `betterAuthAdminUsersGateway` but speaks plain JS — no headers, no
 * cookies, no HTTP envelopes. Tests seed `state.users` / `state.sessions`
 * and assert on `state.calls.*` to verify side-effects.
 */
export function makeFakeGateway(
  seed: { users?: AdminUser[]; sessions?: AdminUserSession[] } = {},
): { gateway: AdminUsersGateway; state: FakeGatewayState } {
  const state: FakeGatewayState = {
    users: seed.users ? [...seed.users] : [],
    sessions: seed.sessions ? [...seed.sessions] : [],
    calls: {
      banUser: [],
      unbanUser: [],
      setRole: [],
      revokeUserSessions: [],
      revokeUserSession: [],
      impersonateUser: [],
    },
  }

  const gateway: AdminUsersGateway = {
    async listUsers(input: ListUsersInput): Promise<ListUsersResult> {
      let users = state.users
      if (input.q) {
        const needle = input.q.toLowerCase()
        users = users.filter(
          (u) =>
            u.email.toLowerCase().includes(needle) ||
            u.name.toLowerCase().includes(needle),
        )
      }
      if (typeof input.banned === 'boolean') {
        users = users.filter((u) => u.banned === input.banned)
      }
      if (input.role !== undefined) {
        users = users.filter((u) => (u.role ?? null) === input.role)
      }
      const sorted = [...users].sort((a, b) => {
        const dir = input.sortDirection === 'asc' ? 1 : -1
        if (input.sortBy === 'name') return a.name.localeCompare(b.name) * dir
        if (input.sortBy === 'email') return a.email.localeCompare(b.email) * dir
        return (a.createdAt.getTime() - b.createdAt.getTime()) * dir
      })
      const total = sorted.length
      const offset = (input.page - 1) * input.pageSize
      const page = sorted.slice(offset, offset + input.pageSize)
      return {
        users: page,
        total,
        page: input.page,
        pageSize: input.pageSize,
      }
    },

    async getUserById({ userId }) {
      return state.users.find((u) => u.id === userId) ?? null
    },

    async listUserSessions({ userId }) {
      return state.sessions.filter((s) => s.userId === userId)
    },

    async banUser(input) {
      state.calls.banUser.push(input)
      state.users = state.users.map((u) =>
        u.id === input.userId
          ? {
              ...u,
              banned: true,
              banReason: input.reason ?? null,
              banExpires:
                typeof input.expiresInSec === 'number'
                  ? Date.now() + input.expiresInSec * 1000
                  : null,
            }
          : u,
      )
    },

    async unbanUser(input) {
      state.calls.unbanUser.push(input)
      state.users = state.users.map((u) =>
        u.id === input.userId
          ? { ...u, banned: false, banReason: null, banExpires: null }
          : u,
      )
    },

    async setRole(input) {
      state.calls.setRole.push(input)
      state.users = state.users.map((u) =>
        u.id === input.userId ? { ...u, role: input.role } : u,
      )
    },

    async revokeUserSessions(input) {
      state.calls.revokeUserSessions.push(input)
      state.sessions = state.sessions.filter((s) => s.userId !== input.userId)
    },

    async revokeUserSession(input) {
      state.calls.revokeUserSession.push(input)
      state.sessions = state.sessions.filter((s) => s.token !== input.sessionToken)
    },

    async impersonateUser(input) {
      state.calls.impersonateUser.push(input)
    },
  }

  return { gateway, state }
}

export function makeUser(over: Partial<AdminUser> = {}): AdminUser {
  return {
    id: over.id ?? `u_${Math.random().toString(36).slice(2, 10)}`,
    email: over.email ?? 'user@iedora.com',
    name: over.name ?? 'User',
    emailVerified: over.emailVerified ?? true,
    role: over.role ?? null,
    banned: over.banned ?? false,
    banReason: over.banReason ?? null,
    banExpires: over.banExpires ?? null,
    createdAt: over.createdAt ?? new Date('2025-01-01T00:00:00Z'),
    updatedAt: over.updatedAt ?? new Date('2025-01-01T00:00:00Z'),
  }
}

export function makeSession(over: Partial<AdminUserSession> = {}): AdminUserSession {
  return {
    id: over.id ?? `s_${Math.random().toString(36).slice(2, 10)}`,
    token: over.token ?? `tok_${Math.random().toString(36).slice(2, 10)}`,
    userId: over.userId ?? 'u_test',
    ipAddress: over.ipAddress ?? null,
    userAgent: over.userAgent ?? null,
    createdAt: over.createdAt ?? new Date('2025-01-01T00:00:00Z'),
    expiresAt: over.expiresAt ?? new Date('2025-12-31T00:00:00Z'),
    impersonatedBy: over.impersonatedBy ?? null,
  }
}
