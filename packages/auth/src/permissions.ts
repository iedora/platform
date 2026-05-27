/**
 * Iedora access-control taxonomy — the single source of truth for what
 * each role can do across every product in the estate.
 *
 * Shape comes from better-auth's `createAccessControl` primitive: a
 * `statement` declares the resources + the actions each resource exposes,
 * then roles are bound to subsets of those (resource, action) pairs.
 *
 * THREE orthogonal axes are encoded in every scope string:
 *
 *   <kind>:<product>:<resource>:<verb>
 *
 *   - kind:     `tenant` (per-org, resolved against `member.role` + the
 *               active organization context) vs `staff` (cross-tenant,
 *               resolved against `user.role`).
 *   - product:  `core` (auth + admin surface), `menu` (restaurant SaaS),
 *               and the products that follow. Reflects `products/<x>/`
 *               in the monorepo. Without this axis, identically-named
 *               resources in different products would collide (e.g.
 *               `tenant.menu.billing` vs a future `tenant.imopush.billing`).
 *   - resource: kebab plural noun (`users`, `restaurants`, `qr-codes`).
 *   - verb:     single kebab. CRUD-canonical (`create`/`read`/`update`/
 *               `delete` — or `list`/`get` when distinguishing matters)
 *               with special verbs (`ban`, `impersonate`, `set-role`,
 *               `publish`, `revoke`) reserved for actions whose blast
 *               radius differs from a normal mutation.
 *
 * Statement keys are the dotted form (`'tenant.menu.qr-codes'`) — better-
 * auth's `createAccessControl` accepts arbitrary string keys, and the
 * dot-separator lets `scopeToPermission('tenant:menu:qr-codes:read')`
 * become a trivial `parts.pop()` + `parts.join('.')`.
 *
 * Framework-free. Imported from server use-cases, route handlers, tests,
 * and the better-auth instance configuration. MUST NOT depend on
 * `server-only`, `next`, or any DB client.
 */

import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements, adminAc, memberAc, ownerAc } from 'better-auth/plugins/organization/access'

/**
 * Resource → actions taxonomy. Extend by adding either a new key (new
 * resource) or a new entry to an existing array (new verb).
 *
 * `...defaultStatements` pulls in the resources better-auth's
 * organization plugin defines itself (`organization`, `member`,
 * `invitation`, `team`) — these stay single-segment because the org
 * plugin evaluates them internally and renaming would break the
 * gating it does in request handlers. See
 * `docs/auth/custom-plugin-investigation.md` (TBD) for the path to
 * lifting that limitation.
 */
export const statement = {
  ...defaultStatements,

  // ── Per-tenant: menu product (per-org consumers) ─────────────────
  // CRUD-canonical: `read`/`create`/`update`/`delete`. Special verbs
  // (`publish`) only when the action's blast radius differs from a
  // normal mutation. `billing` stays read-only until a write surface
  // exists — splitting `manage` from `update` was speculative.
  'tenant.menu.restaurants': ['read', 'create', 'update', 'delete'],
  'tenant.menu.menus':       ['read', 'create', 'update', 'delete', 'publish'],
  'tenant.menu.qr-codes':    ['read', 'create', 'update', 'delete'],
  'tenant.menu.analytics':   ['read'],
  'tenant.menu.billing':     ['read'],

  // ── Control plane: core product (cross-tenant staff) ─────────────
  // `users` verbs split by blast radius:
  //   - read        — list/view + their sessions
  //   - ban         — ban + unban (reversible lifecycle)
  //   - set-role    — ISOLATED: grant/revoke staff roles. Sub-roles
  //                   without this scope cannot self-escalate.
  //   - impersonate — ISOLATED: act as a user. Different blast.
  'staff.core.users': ['read', 'ban', 'set-role', 'impersonate'],

  // `orgs` — cross-tenant view only today (no admin UI to mutate org
  // metadata or provision tenants manually; add verbs when surfaces
  // appear).
  'staff.core.orgs': ['list', 'get'],

  // `members` — membership operations across any org. Split because
  //   - `remove` is troubleshooting blast (support tier can do it),
  //   - `update-role` is escalation blast (can grant tenant owner;
  //     admin-only).
  'staff.core.members': ['remove', 'update-role'],

  // `invitations` — revoke pending org invites. (Listing is part of
  // the org detail read; no standalone `list` verb today.)
  'staff.core.invitations': ['cancel'],

  // `sessions` — every session across every user. `revoke` is the
  // canonical scope for killing a session, replacing the earlier
  // overload on `users:ban`.
  'staff.core.sessions': ['list', 'revoke'],

  // `audit` — read-only timeline of every state change on the
  // auth/admin surface. Bound to `iedora-admin` via the wildcard;
  // deliberately NOT in `iedora-support`. A future `Auditor` role
  // could carry just this scope and nothing else.
  'staff.core.audit': ['read'],

  // `admin` — "may render the cross-tenant admin shell at all". Held
  // by both staff roles (iedora-admin via wildcard, iedora-support
  // by explicit binding). Used by the admin layout + overview as the
  // entry gate — anyone without this scope cannot reach any admin
  // surface, including the ones with their own narrower scope
  // (no orphan deep-links).
  'staff.core.admin': ['read'],
} as const

/**
 * The configured access-control instance. Passed to better-auth's
 * `organization` and `admin` plugins so role checks resolve against the
 * same taxonomy everywhere.
 */
export const ac = createAccessControl(statement)

/**
 * Per-org role: `member`. Default for any user invited into an org.
 *
 * Inherits org/member/invitation visibility from better-auth's `memberAc`,
 * then adds iedora-specific read-only access to the restaurant + menu
 * surfaces so a regular member can browse the org's data without being
 * able to mutate it.
 */
export const member = ac.newRole({
  ...memberAc.statements,
  'tenant.menu.restaurants': ['read'],
  'tenant.menu.menus':       ['read'],
})

/**
 * Per-org role: `admin`. Day-to-day operator — can shape menus, manage
 * QR codes, see analytics. Cannot delete the org or invoice ledger
 * (those stay on `owner`).
 */
export const admin = ac.newRole({
  ...adminAc.statements,
  'tenant.menu.restaurants': ['read', 'create', 'update'],
  'tenant.menu.menus':       ['read', 'create', 'update', 'delete', 'publish'],
  'tenant.menu.qr-codes':    ['read', 'create', 'update', 'delete'],
  'tenant.menu.analytics':   ['read'],
  'tenant.menu.billing':     ['read'],
})

/**
 * Per-org role: `owner`. Full control over the organization — every
 * action on every resource, including destructive ones (delete
 * restaurants, manage billing, remove members).
 */
export const owner = ac.newRole({
  ...ownerAc.statements,
  'tenant.menu.restaurants': ['read', 'create', 'update', 'delete'],
  'tenant.menu.menus':       ['read', 'create', 'update', 'delete', 'publish'],
  'tenant.menu.qr-codes':    ['read', 'create', 'update', 'delete'],
  'tenant.menu.analytics':   ['read'],
  'tenant.menu.billing':     ['read'],
})

/**
 * Build a wildcard role from a statement. Binds every (resource, verb)
 * pair declared in the statement to the resulting role. The single
 * source of truth for "what does `iedora-admin` cover" — adding a verb
 * to `statement` automatically lands on the wildcard, zero drift.
 */
function buildWildcardRole<S extends Record<string, readonly string[]>>(s: S) {
  const wildcard: Record<string, readonly string[]> = {}
  for (const [k, v] of Object.entries(s)) {
    wildcard[k] = v
  }
  return ac.newRole(wildcard as never)
}

/**
 * Cross-tenant role: `iedoraAdmin`. The wildcard. Granted directly on
 * the user (via the better-auth `admin` plugin's user-level role field —
 * NOT through org membership), so a single grant transcends every org.
 *
 * Derived from `statement` via `buildWildcardRole` — never written by
 * hand. New actions in the taxonomy land here automatically.
 */
export const iedoraAdmin = buildWildcardRole(statement)

/**
 * Cross-tenant role: `iedoraSupport`. Lower-blast staff tier — can see
 * users, create them, and lock/unlock accounts during troubleshooting.
 * Explicitly cannot `set-role` (no self-escalation to iedora-admin)
 * nor `impersonate` (no acting-as another tenant).
 *
 * Granted directly on the user (via the better-auth `admin` plugin's
 * user-level role field — NOT through org membership). Verbose by
 * design — the explicit list is the audit trail.
 */
export const iedoraSupport = ac.newRole({
  // Admin shell entry — every staff role needs this.
  'staff.core.admin':       ['read'],
  // Users: read + troubleshooting lifecycle. No set-role (escalation),
  // no impersonate (cross-tenant blast).
  'staff.core.users':       ['read', 'ban'],
  // Orgs: visibility only. No metadata mutation, no provisioning.
  'staff.core.orgs':        ['list', 'get'],
  // Membership: can kick a stuck user but cannot promote (no
  // `update-role` — that grants tenant owner cross-tenant).
  'staff.core.members':     ['remove'],
  // Invitations: visibility + revoke (troubleshooting a stuck invite).
  'staff.core.invitations': ['cancel'],
  // Sessions: full lifecycle (troubleshooting "user can't log out").
  'staff.core.sessions':    ['list', 'revoke'],
})

/**
 * The bound role registry passed to better-auth. Keys are the role
 * identifiers the library stores on `member.role` / `user.role`.
 */
export const roles = { member, admin, owner } as const
export type RoleKey = keyof typeof roles

/**
 * Cross-tenant staff role registry. Keys are the literals the
 * `admin` plugin stores in `user.role`. Resolves against the
 * statement-level AC, NOT the org plugin's per-membership AC.
 */
export const staffRoles = {
  'iedora-admin': iedoraAdmin,
  'iedora-support': iedoraSupport,
} as const
export type StaffRoleKey = keyof typeof staffRoles

/**
 * Convert a `<kind>:<product>:<resource>:<verb>` scope string into the
 * AC permission shape `.authorize()` expects:
 *
 *   `staff:core:users:read` → `{ 'staff.core.users': ['read'] }`
 *
 * Last colon-separated segment is the verb; everything before, joined
 * by dots, is the statement key. Lives here (not in each product's
 * `scopes.ts`) so every consumer — Next-product wrappers, the audit
 * page introspection, tests — uses the same parser.
 *
 * Pure function. Throws on a malformed input rather than producing a
 * meaningless permission object.
 */
export function scopeToPermission(scope: string): Record<string, string[]> {
  const parts = scope.split(':')
  const verb = parts.pop()
  if (parts.length < 1 || !verb) {
    throw new Error(`[iedora/auth] malformed scope ${scope}`)
  }
  return { [parts.join('.')]: [verb] }
}

/**
 * Non-throwing scope probe for STAFF roles — the canonical "does this
 * `user.role` permit this scope?" primitive. Every product with a
 * staff surface (today: core; tomorrow: imopush staff, finance
 * staff, ...) builds its `hasScope` / `requireScope` guards on top
 * of this — so the role-resolution + `.authorize()` logic lives in
 * exactly ONE place.
 *
 * Each product wraps it with two thin Next-aware helpers:
 *
 *   - `hasScope(scope)` — read session, call `hasStaffScope`,
 *     return boolean. Use for UI gating (render IF scope held).
 *   - `requireScope(scope)` — same, but redirect/404 on miss + emit
 *     an `auth.denied` audit row. Use as a route/action guard.
 *
 * The split keeps Next-specific code (`headers()`, `redirect()`,
 * `notFound()`, audit hooks) out of `@iedora/auth` — this package
 * stays framework-free.
 *
 * Anonymous / tenant-only / unknown roles always return false.
 * Scope strings are the universal `<kind>:<product>:<resource>:<verb>`
 * format — callers DON'T translate to permission shape first.
 */
export async function hasStaffScope(
  role: string | null | undefined,
  scope: string,
): Promise<boolean> {
  if (role === null || role === undefined) return false
  if (!(role in staffRoles)) return false
  const { success } = await staffRoles[role as StaffRoleKey].authorize(
    scopeToPermission(scope) as never,
  )
  return success
}

/**
 * Statement type alias — useful for typing `hasPermission` calls.
 */
export type Statement = typeof statement
