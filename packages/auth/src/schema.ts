import {
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  pgSchema,
} from 'drizzle-orm/pg-core'

/**
 * Drizzle schema for the iedora auth surface.
 *
 * Lives in the `core` Postgres database, under the `core` schema, on the
 * SHARED Postgres instance. `core` is the namespace owned by the (future)
 * core product — auth tables today, audit + admin tables tomorrow.
 *
 * Tables match the shape better-auth expects (the library generates SQL
 * with these exact column names when you run its CLI; we maintain the
 * schema by hand here so we own migrations and the type surface stays
 * in one place).
 *
 * Tables:
 *   - `user`         — identity row. `role` is the cross-tenant scalar
 *                       (null for tenants, `iedora-admin` for staff).
 *   - `session`      — opaque token + activeOrganizationId pointer.
 *   - `account`      — provider linkage. With email+password only, a row
 *                       per user with `providerId='credential'`.
 *   - `verification` — short-lived OTPs / email-change tokens.
 *   - `organization` — the tenant entity. Menu's `restaurants` row joins
 *                       to this via `organizationId`.
 *   - `member`       — (user, organization, role) join. `role` is one of
 *                       `owner` / `admin` / `member`.
 *   - `invitation`   — pending email invites with TTL.
 *
 * All columns use snake_case at the database layer (Drizzle's
 * `casing: 'snake_case'` config in `drizzle.config.ts`).
 */

export const coreSchema = pgSchema('core')

export const user = coreSchema.table('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  /**
   * Cross-tenant role granted directly on the user. `null` for normal
   * tenants; `'iedora-admin'` for staff. Resolved by better-auth's
   * `admin` plugin to back `requireScope` / `hasScope`.
   */
  role: text('role'),
  /** Set by the `admin` plugin when an account is banned. */
  banned: boolean('banned'),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = coreSchema.table('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /**
   * Set by the `organization` plugin. Points at the org the user is
   * currently acting on. Authorisation checks resolve role + permission
   * against the corresponding `member` row.
   */
  activeOrganizationId: text('active_organization_id'),
  /** Set by `admin` plugin during impersonation. */
  impersonatedBy: text('impersonated_by'),
})

export const account = coreSchema.table('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = coreSchema.table('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const organization = coreSchema.table('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  logo: text('logo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  /** Free-form JSON metadata (e.g. plan code, billing flags). */
  metadata: text('metadata'),
})

export const member = coreSchema.table('member', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /**
   * Role within the organization. One of the keys exported from
   * `./permissions.ts` (`owner` / `admin` / `member`). Stored as raw
   * text so a renamed role doesn't blow up reads — better-auth coerces
   * unknown roles to `member` defensively.
   */
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const invitation = coreSchema.table('invitation', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  inviterId: text('inviter_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  role: text('role'),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
})

/**
 * Rate-limit table. Used by better-auth's built-in rate limiter when
 * `storage: 'database'` is configured — survives process restarts and
 * works across multiple Next.js instances behind the same Postgres.
 */
export const rateLimit = coreSchema.table('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key'),
  count: integer('count'),
  lastRequest: timestamp('last_request'),
})

/**
 * Audit log — every state-changing event on the auth + admin surface.
 *
 * Append-only by design. No row is ever updated or deleted by app code;
 * a future vacuum-job may purge old rows under a retention policy, but
 * day 0 there's no TTL — events live forever.
 *
 * `actor_*` columns are denormalized snapshots taken at the moment of
 * the event — the user row may be banned/renamed later, but the audit
 * trail remembers what was true when the action happened. Same for
 * `target_*`.
 *
 * `event` is the namespaced event key (see `audit.ts` for the registry).
 * Examples: `user.signed-up`, `user.banned`, `member.removed`,
 * `auth.denied`. New event types are free strings — no enum.
 *
 * `outcome` is one of:
 *   - `success` — action completed
 *   - `denied`  — caller authenticated but lacked the required scope
 *   - `error`   — action threw at the gateway layer (audit fires anyway)
 *
 * `meta` is a free-form JSON blob — ban reason, role granted, scope
 * attempted, etc. Search via `WHERE meta->>'key' = ...` when needed.
 *
 * Indexes are tuned for the four read paths the admin UI uses:
 * timeline (at DESC), per-actor history, per-target history (by user
 * AND by org separately), and per-event-type filter.
 */
export const auditLog = coreSchema.table(
  'audit_log',
  {
    id: text('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),

    // Actor — snapshot of who did the thing.
    actorUserId: text('actor_user_id'),
    actorRole: text('actor_role'),
    actorEmail: text('actor_email'),

    // Event taxonomy.
    event: text('event').notNull(),
    outcome: text('outcome').notNull(),

    // Target(s) — populated when the event has one. Multiple may be
    // set (e.g. session.revoked has target_user_id + target_session_id).
    targetUserId: text('target_user_id'),
    targetOrgId: text('target_org_id'),
    targetSessionId: text('target_session_id'),

    // Caller context. `ipHash` is SHA-256 of the IP, hex — keeps the
    // audit trail useful for "same actor came back" without retaining
    // raw PII at rest.
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    requestPath: text('request_path'),

    // Free-form details. Examples: { reason, banExpiresIn, role,
    // scope, attemptedPath, previousRole, organizationId }.
    meta: jsonb('meta'),

    // Filter toggle for the timeline UI — `false` for high-volume
    // routine events (page views), `true` for state changes worth
    // highlighting (bans, role changes, impersonations).
    important: boolean('important').notNull().default(false),
  },
  (t) => [
    index('audit_log_at_idx').on(t.at),
    index('audit_log_actor_idx').on(t.actorUserId, t.at),
    index('audit_log_target_user_idx').on(t.targetUserId, t.at),
    index('audit_log_target_org_idx').on(t.targetOrgId, t.at),
    index('audit_log_event_idx').on(t.event, t.at),
  ],
)

export const schema = {
  user,
  session,
  account,
  verification,
  organization,
  member,
  invitation,
  rateLimit,
  auditLog,
}
