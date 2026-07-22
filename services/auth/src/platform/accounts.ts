import type { Kysely } from "kysely"

import { SECOND } from "@iedora/common"

import { emitAudit } from "./audit.ts"
import { db } from "./db.ts"
import type { DB, Identity, Session, Tenant, User } from "./schema.ts"
import { hashRefreshToken, newRefreshToken, signAccessToken } from "./tokens.ts"
import type { ProviderProfile } from "./providers/types.ts"
import { config } from "./config.ts"

/** A DB executor: the shared `db` or an open transaction (`Transaction<DB>`
 *  satisfies `Kysely<DB>`), so kernel helpers run inside or outside a tx. */
export type Exec = Kysely<DB>

export type TokenBundle = {
  accessToken: string
  refreshToken: string
  tokenType: "Bearer"
  expiresIn: number
}

export async function getTenantBySlug(slug: string): Promise<Tenant | undefined> {
  return db.selectFrom("tenant").selectAll().where("slug", "=", slug).executeTakeFirst()
}

export async function findUserByEmail(
  tenantId: string,
  email: string,
): Promise<User | undefined> {
  return db
    .selectFrom("user")
    .selectAll()
    .where("tenantId", "=", tenantId)
    .where("email", "=", email.toLowerCase())
    .executeTakeFirst()
}

export async function findIdentity(
  tenantId: string,
  providerId: string,
  subject: string,
): Promise<Identity | undefined> {
  return db
    .selectFrom("identity")
    .selectAll()
    .where("tenantId", "=", tenantId)
    .where("providerId", "=", providerId)
    .where("subject", "=", subject)
    .executeTakeFirst()
}

/** Create a user and its identity in one transaction. Used by password register
 *  and first-time OAuth. Throws on a duplicate (tenant, email). */
export async function createUser(
  tenant: Tenant,
  input: {
    email: string
    name?: string | null
    emailVerified?: boolean
    providerId: string
    subject: string
    passwordHash?: string | null
  },
): Promise<User> {
  return db.transaction().execute(async (trx) => {
    const user = await trx
      .insertInto("user")
      .values({
        tenantId: tenant.id,
        email: input.email.toLowerCase(),
        name: input.name ?? null,
        emailVerified: input.emailVerified ?? false,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    await trx
      .insertInto("identity")
      .values({
        tenantId: tenant.id,
        userId: user.id,
        providerId: input.providerId,
        subject: input.subject,
        passwordHash: input.passwordHash ?? null,
      })
      .execute()
    return user
  })
}

/** Resolve (or create) the user behind an OAuth profile. Links to an existing
 *  user by email when the email is verified, otherwise creates a fresh account. */
export async function upsertOAuthUser(
  tenant: Tenant,
  providerId: string,
  profile: ProviderProfile,
): Promise<User> {
  const existingIdentity = await findIdentity(tenant.id, providerId, profile.subject)
  if (existingIdentity) {
    return db
      .selectFrom("user")
      .selectAll()
      .where("id", "=", existingIdentity.userId)
      .executeTakeFirstOrThrow()
  }

  if (profile.email && profile.emailVerified) {
    const existingUser = await findUserByEmail(tenant.id, profile.email)
    if (existingUser) {
      await db
        .insertInto("identity")
        .values({
          tenantId: tenant.id,
          userId: existingUser.id,
          providerId,
          subject: profile.subject,
        })
        .execute()
      return existingUser
    }
  }

  return createUser(tenant, {
    email: profile.email ?? `${providerId}:${profile.subject}`,
    name: profile.name ?? null,
    emailVerified: profile.emailVerified ?? false,
    providerId,
    subject: profile.subject,
  })
}

/** Per-request context recorded on the session + folded into the token. */
export type SessionContext = {
  /** Authentication methods for the token's `amr`, e.g. ["pwd"], ["oauth"]. */
  amr?: string[]
  ip?: string | null
  userAgent?: string | null
  /** Preferred active org for this session; falls back to the first membership. */
  activeOrg?: string | null
}

/** A user is blocked while banned and the ban hasn't expired. */
function isBanned(user: User): boolean {
  if (!user.banned) return false
  return !user.banExpiresAt || user.banExpiresAt.getTime() > Date.now()
}

/** Revoke every live link in a refresh family — used on reuse detection and
 *  "sign out this device". */
export async function burnFamily(tenantId: string, familyId: string): Promise<void> {
  await db
    .updateTable("session")
    .set({ revokedAt: new Date() })
    .where("tenantId", "=", tenantId)
    .where("familyId", "=", familyId)
    .where("revokedAt", "is", null)
    .execute()
}

/** A tenant-scoped user by id (full row), or undefined. */
export function findUserById(tenantId: string, userId: string): Promise<User | undefined> {
  return db
    .selectFrom("user")
    .selectAll()
    .where("tenantId", "=", tenantId)
    .where("id", "=", userId)
    .executeTakeFirst()
}

/** Revoke all of a user's live sessions (every family). */
export async function revokeAllUserSessions(
  exec: Exec,
  tenantId: string,
  userId: string,
): Promise<void> {
  await liveSessions(exec, tenantId, userId).set({ revokedAt: new Date() }).execute()
}

/** Revoke all of a user's live sessions except the given family. */
export async function revokeOtherFamilies(
  exec: Exec,
  tenantId: string,
  userId: string,
  keepFamily: string,
): Promise<void> {
  await liveSessions(exec, tenantId, userId)
    .where("familyId", "!=", keepFamily)
    .set({ revokedAt: new Date() })
    .execute()
}

// Shared predicate for "this user's still-live sessions".
function liveSessions(exec: Exec, tenantId: string, userId: string) {
  return exec
    .updateTable("session")
    .where("tenantId", "=", tenantId)
    .where("userId", "=", userId)
    .where("revokedAt", "is", null)
}

/** Upsert the password identity and stamp the user. `forceChange` sets the
 *  must-change flag (admin set-password); the reset/self flows clear it. */
export async function writePassword(
  exec: Exec,
  input: { tenantId: string; userId: string; email: string; hash: string; forceChange?: boolean },
): Promise<void> {
  const existing = await exec
    .selectFrom("identity")
    .select("id")
    .where("tenantId", "=", input.tenantId)
    .where("userId", "=", input.userId)
    .where("providerId", "=", "password")
    .executeTakeFirst()
  if (existing) {
    await exec.updateTable("identity").set({ passwordHash: input.hash }).where("id", "=", existing.id).execute()
  } else {
    await exec
      .insertInto("identity")
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        providerId: "password",
        subject: input.email.toLowerCase(),
        passwordHash: input.hash,
      })
      .execute()
  }
  await exec
    .updateTable("user")
    .set({ passwordChangedAt: new Date(), mustChangePassword: input.forceChange ?? false })
    .where("id", "=", input.userId)
    .execute()
}

export type SessionFamily = { family: string; links: Session[]; first: Session; last: Session }

/** Collapse session rows (ordered by createdAt asc) into one entry per refresh
 *  family, newest-active first. The single place that knows the family shape. */
export function foldSessionFamilies(rows: Session[]): SessionFamily[] {
  const byFamily = new Map<string, Session[]>()
  for (const r of rows) {
    const links = byFamily.get(r.familyId) ?? []
    links.push(r)
    byFamily.set(r.familyId, links)
  }
  return [...byFamily.values()]
    .map((links) => ({ family: links[0]!.familyId, links, first: links[0]!, last: links[links.length - 1]! }))
    .sort((a, b) => b.last.createdAt.getTime() - a.last.createdAt.getTime())
}

/** Roles + active org for a user's token. Prefers `prefer` when the user is a
 *  member of it, else their first membership (stable by creation order); null
 *  when they have none. */
export async function activeMembership(
  tenantId: string,
  userId: string,
  prefer?: string | null,
): Promise<{ org: string | null; roles: string[] }> {
  if (prefer) {
    const pm = await db
      .selectFrom("membership")
      .select(["organizationId", "role"])
      .where("tenantId", "=", tenantId)
      .where("userId", "=", userId)
      .where("organizationId", "=", prefer)
      .executeTakeFirst()
    if (pm) return { org: pm.organizationId, roles: [pm.role] }
  }
  const m = await db
    .selectFrom("membership")
    .select(["organizationId", "role"])
    .where("tenantId", "=", tenantId)
    .where("userId", "=", userId)
    .orderBy("createdAt", "asc")
    .executeTakeFirst()
  return m ? { org: m.organizationId, roles: [m.role] } : { org: null, roles: [] }
}

/** Open a NEW refresh family + issue the first token bundle. Used by login,
 *  register, and OAuth callback. */
export async function issueTokens(
  tenant: Tenant,
  user: User,
  ctx: SessionContext = {},
): Promise<TokenBundle> {
  const refresh = newRefreshToken()
  const now = Date.now()
  const { org, roles } = await activeMembership(tenant.id, user.id, ctx.activeOrg)
  // Insert first so the token can carry the session family id as `sid`.
  const session = await db
    .insertInto("session")
    .values({
      tenantId: tenant.id,
      userId: user.id,
      refreshTokenHash: refresh.hash,
      expiresAt: new Date(now + config.refreshTtl * SECOND),
      absoluteExpiresAt: new Date(now + config.refreshAbsoluteTtl * SECOND),
      activeOrganizationId: org,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  const { token: accessToken, expiresIn } = await signAccessToken(tenant, user, {
    sid: session.familyId,
    org,
    roles,
    amr: ctx.amr,
  })
  await emitAudit(db, {
    tenantId: tenant.id,
    action: "auth.session.started",
    actorType: "user",
    actorId: user.id,
    entityType: "user",
    entityId: user.id,
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
    metadata: { familyId: session.familyId, amr: ctx.amr ?? [] },
  })
  return { accessToken, refreshToken: refresh.token, tokenType: "Bearer", expiresIn }
}

/** Rotate a refresh token within its family. Returns null when the token is
 *  unknown/expired/banned. Presenting an already-rotated or revoked token is
 *  treated as theft: the whole family is burned (and null returned). */
export async function rotateRefresh(
  tenant: Tenant,
  refreshToken: string,
  ctx: SessionContext = {},
): Promise<TokenBundle | null> {
  const hash = hashRefreshToken(refreshToken)
  const session = await db
    .selectFrom("session")
    .selectAll()
    .where("tenantId", "=", tenant.id)
    .where("refreshTokenHash", "=", hash)
    .executeTakeFirst()
  if (!session) return null

  // Reuse detection: a token that was already rotated (or revoked) is presented
  // again → likely stolen. Burn the family so neither party can continue.
  if (session.replacedBy || session.revokedAt) {
    await burnFamily(tenant.id, session.familyId)
    await emitAudit(db, {
      tenantId: tenant.id,
      action: "auth.token.reuse_detected",
      outcome: "failure",
      actorType: "user",
      actorId: session.userId,
      entityType: "session",
      entityId: session.familyId,
    })
    return null
  }

  const now = Date.now()
  const absExpired = session.absoluteExpiresAt && session.absoluteExpiresAt.getTime() < now
  if (session.expiresAt.getTime() < now || absExpired) return null

  const user = await db
    .selectFrom("user")
    .selectAll()
    .where("id", "=", session.userId)
    .executeTakeFirstOrThrow()
  if (isBanned(user)) {
    await burnFamily(tenant.id, session.familyId)
    return null
  }

  // Rotate: new link in the SAME family, old link revoked + pointed at the new
  // one. The family's active org is preserved across rotation.
  const refresh = newRefreshToken()
  const next = await db.transaction().execute(async (trx) => {
    const created = await trx
      .insertInto("session")
      .values({
        tenantId: tenant.id,
        userId: user.id,
        refreshTokenHash: refresh.hash,
        familyId: session.familyId,
        expiresAt: new Date(now + config.refreshTtl * SECOND),
        absoluteExpiresAt: session.absoluteExpiresAt,
        activeOrganizationId: session.activeOrganizationId,
        ip: ctx.ip ?? session.ip,
        userAgent: ctx.userAgent ?? session.userAgent,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    await trx
      .updateTable("session")
      .set({ revokedAt: new Date(), replacedBy: created.id })
      .where("id", "=", session.id)
      .execute()
    return created
  })

  const { org, roles } = await activeMembership(tenant.id, user.id, session.activeOrganizationId)
  const { token: accessToken, expiresIn } = await signAccessToken(tenant, user, {
    sid: next.familyId,
    org,
    roles,
    amr: ctx.amr,
  })
  return { accessToken, refreshToken: refresh.token, tokenType: "Bearer", expiresIn }
}

export async function revokeRefresh(tenant: Tenant, refreshToken: string): Promise<void> {
  // Sign out the whole family this token belongs to, not just the current link.
  const session = await db
    .selectFrom("session")
    .select(["familyId", "userId"])
    .where("tenantId", "=", tenant.id)
    .where("refreshTokenHash", "=", hashRefreshToken(refreshToken))
    .executeTakeFirst()
  if (session) {
    await burnFamily(tenant.id, session.familyId)
    await emitAudit(db, {
      tenantId: tenant.id,
      action: "auth.session.ended",
      actorType: "user",
      actorId: session.userId,
      entityType: "session",
      entityId: session.familyId,
    })
  }
}
