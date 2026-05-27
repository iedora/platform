import 'server-only'
import { headers as nextHeaders } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth, getCoreDb, schema } from '@iedora/auth'
import type {
  AdminUser,
  AdminUserSession,
  AdminUsersGateway,
  ListUsersInput,
  ListUsersResult,
} from '../ports'

/**
 * The only file that names `auth.api.*` for the users slice. Every
 * other module talks to the gateway interface, which keeps better-auth
 * envelopes out of the use-cases and lets tests run against a fake.
 *
 * Each method re-reads request headers via `next/headers` so the call
 * authenticates as the caller of the current server action / page.
 * Cheaper than threading a `Headers` arg through every use-case.
 */
export function betterAuthAdminUsersGateway(): AdminUsersGateway {
  const h = async () => await nextHeaders()
  return {
    async listUsers(input: ListUsersInput): Promise<ListUsersResult> {
      const offset = (input.page - 1) * input.pageSize
      const response = await auth.api.listUsers({
        query: {
          limit: input.pageSize,
          offset,
          sortBy: input.sortBy,
          sortDirection: input.sortDirection,
          ...(input.q
            ? {
                searchField: 'email',
                searchOperator: 'contains',
                searchValue: input.q,
              }
            : {}),
        },
        headers: await h(),
      })

      let users = (response.users ?? []).map(mapUser)
      // better-auth's `searchField` is single-column; layer a small
      // in-memory union so the query box matches "name OR email".
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

      return {
        users,
        total: typeof response.total === 'number' ? response.total : users.length,
        page: input.page,
        pageSize: input.pageSize,
      }
    },

    async getUserById({ userId }) {
      // better-auth has no admin-side `getUser({ id })` endpoint, so
      // fall through to Drizzle. Cheaper than re-paging listUsers.
      const db = getCoreDb()
      const [row] = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1)
      if (!row) return null
      return mapUser(row)
    },

    async listUserSessions({ userId }) {
      const response = await auth.api.listUserSessions({
        body: { userId },
        headers: await h(),
      })
      return (response.sessions ?? []).map<AdminUserSession>((s) => ({
        id: s.id,
        token: s.token,
        userId,
        ipAddress: s.ipAddress ?? null,
        userAgent: s.userAgent ?? null,
        createdAt: new Date(s.createdAt),
        expiresAt: new Date(s.expiresAt),
        impersonatedBy:
          (s as { impersonatedBy?: string | null }).impersonatedBy ?? null,
      }))
    },

    async banUser({ userId, reason, expiresInSec }) {
      await auth.api.banUser({
        body: {
          userId,
          ...(reason ? { banReason: reason } : {}),
          ...(typeof expiresInSec === 'number'
            ? { banExpiresIn: expiresInSec }
            : {}),
        },
        headers: await h(),
      })
    },

    async unbanUser({ userId }) {
      await auth.api.unbanUser({
        body: { userId },
        headers: await h(),
      })
    },

    async setRole({ userId, role }) {
      await auth.api.setRole({
        body: {
          userId,
          // better-auth accepts `null`/empty to clear the role.
          role: (role ?? '') as never,
        },
        headers: await h(),
      })
    },

    async revokeUserSessions({ userId }) {
      await auth.api.revokeUserSessions({
        body: { userId },
        headers: await h(),
      })
    },

    async revokeUserSession({ sessionToken }) {
      await auth.api.revokeUserSession({
        body: { sessionToken },
        headers: await h(),
      })
    },

    async impersonateUser({ userId }) {
      await auth.api.impersonateUser({
        body: { userId },
        headers: await h(),
      })
    },
  }
}

function mapUser(u: {
  id: string
  email: string
  name: string
  emailVerified?: boolean | null
  role?: string | null
  banned?: boolean | null
  banReason?: string | null
  banExpires?: Date | string | number | null
  createdAt: Date | string
  updatedAt: Date | string
}): AdminUser {
  const banExpires = u.banExpires
    ? new Date(u.banExpires).getTime()
    : null
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    emailVerified: Boolean(u.emailVerified),
    role: u.role ?? null,
    banned: Boolean(u.banned),
    banReason: u.banReason ?? null,
    banExpires,
    createdAt: new Date(u.createdAt),
    updatedAt: new Date(u.updatedAt),
  }
}
