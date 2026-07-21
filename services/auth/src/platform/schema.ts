import type { Created, Timestamp } from "@iedora/db"
import type { MessagingDB } from "@iedora/messaging"
import type { ColumnType, Generated, Selectable } from "kysely"

// jsonb: pass objects/arrays on write (the Bun SQL driver serializes them); a
// pre-stringified string double-encodes. Insert-optional (columns have DB defaults).
type Jsonb<T> = ColumnType<T, T | undefined, T>

/** A consuming app or domain. Each tenant has an isolated user pool and its own
 *  enabled providers, so one service instance serves many products/domains. */
interface TenantTable {
  id: Generated<string>
  /** Stable key used in URLs + the `tenant` JWT claim, e.g. "menu", "tutor". */
  slug: string
  name: string
  /** Allowed OAuth redirect URIs / CORS origins for this tenant. */
  allowedOrigins: Jsonb<string[]>
  /** JWT `aud` for this tenant's tokens (defaults to the slug). */
  tokenAudience: string
  /** Optional per-tenant access-token TTL (seconds); null = service default. */
  accessTtl: number | null
  createdAt: Created
}

/** A provider enabled for a tenant. `config` is provider-shaped (OAuth client
 *  creds + endpoints for oauth2; empty for password). This is what makes external
 *  providers generic: add a row, no code change. */
interface TenantProviderTable {
  id: Generated<string>
  tenantId: string
  /** "password" | "google" | "github" | "oidc:<slug>" … */
  providerId: string
  /** "password" | "oauth2" */
  kind: string
  config: Jsonb<Record<string, unknown>>
  enabled: Generated<boolean>
  createdAt: Created
}

interface UserTable {
  id: Generated<string>
  tenantId: string
  email: string
  emailVerified: Generated<boolean>
  name: string | null
  /** Suspended: blocked at login + refresh. `banExpiresAt` null = indefinite. */
  banned: Generated<boolean>
  banReason: string | null
  banExpiresAt: Timestamp | null
  /** Forced password change: minted as the `mcp` access claim + enforced. */
  mustChangePassword: Generated<boolean>
  passwordChangedAt: Timestamp | null
  createdAt: Created
}

/** A workspace/account within a tenant. Users join via memberships, so a user
 *  can exist before belonging to any organization. */
interface OrganizationTable {
  id: Generated<string>
  tenantId: string
  /** Unique per tenant (not globally). */
  slug: string
  name: string
  // DB-defaulted to '{}', so optional on insert.
  metadata: Jsonb<Record<string, unknown>>
  createdAt: Created
}

/** The user↔organization edge, carrying the role. One row per (org, user). */
interface MembershipTable {
  id: Generated<string>
  tenantId: string
  organizationId: string
  userId: string
  /** "owner" | "admin" | "member" (products may define their own). */
  role: Generated<string>
  createdAt: Created
}

/** A single-use password-reset grant; only the hash is stored. */
interface PasswordResetTokenTable {
  id: Generated<string>
  tenantId: string
  userId: string
  tokenHash: string
  expiresAt: Timestamp
  claimedAt: Timestamp | null
  createdAt: Created
}

/** A machine-to-machine client (client-credentials grant). `tenantId` null =
 *  platform-scoped. Only the secret hash is stored. */
interface ServiceClientTable {
  id: Generated<string>
  tenantId: string | null
  clientId: string
  secretHash: string
  audience: string
  name: string
  createdAt: Created
}

/** A way a user authenticates. One user can have many (password + several OAuth).
 *  `passwordHash` is set only for the password provider; `subject` is the
 *  provider's stable user id (email for password, `sub` for OAuth/OIDC). */
interface IdentityTable {
  id: Generated<string>
  tenantId: string
  userId: string
  providerId: string
  subject: string
  passwordHash: string | null
  createdAt: Created
}

/** A refresh session. Only a hash of the refresh token is stored; rotation
 *  revokes the old row and issues a new one. */
interface SessionTable {
  id: Generated<string>
  tenantId: string
  userId: string
  refreshTokenHash: string
  expiresAt: Timestamp
  revokedAt: Timestamp | null
  /** Rotation family: all links share it; reuse of a rotated token burns it. */
  familyId: Generated<string>
  /** Set when this link is rotated — points at the successor session. */
  replacedBy: string | null
  /** Active organization for this family; carried into the token, survives refresh. */
  activeOrganizationId: string | null
  /** Hard cap on the family regardless of sliding refresh. */
  absoluteExpiresAt: Timestamp | null
  ip: string | null
  userAgent: string | null
  createdAt: Created
}

/** Delivery runs on the generic @iedora/messaging outbox (topics "email" /
 *  "audit"); both are POSTed to their microservices by the relay. The outbox +
 *  inbox tables merge in via `MessagingDB`. */
export interface DB extends MessagingDB {
  tenant: TenantTable
  tenantProvider: TenantProviderTable
  user: UserTable
  identity: IdentityTable
  session: SessionTable
  organization: OrganizationTable
  membership: MembershipTable
  passwordResetToken: PasswordResetTokenTable
  serviceClient: ServiceClientTable
}

export type Tenant = Selectable<TenantTable>
export type TenantProvider = Selectable<TenantProviderTable>
export type User = Selectable<UserTable>
export type Identity = Selectable<IdentityTable>
export type Session = Selectable<SessionTable>
export type Organization = Selectable<OrganizationTable>
export type Membership = Selectable<MembershipTable>
export type PasswordResetToken = Selectable<PasswordResetTokenTable>
export type ServiceClient = Selectable<ServiceClientTable>
