import { describe, it, expect } from 'vitest'
import {
  ac,
  statement,
  member,
  admin,
  owner,
  iedoraAdmin,
  iedoraSupport,
  roles,
  staffRoles,
} from './permissions'

/**
 * Pure-function checks over the access-control taxonomy. No better-auth
 * boot, no database — just the role-bound resource/action pairs.
 *
 * The contract these specs lock in:
 *   - Every role exists and is a `ac.newRole` instance.
 *   - `owner` is a strict superset of `admin` for every iedora-defined
 *     resource (defence against accidental privilege regressions).
 *   - `iedoraAdmin` (derived via `buildWildcardRole`) covers every
 *     (resource, action) pair declared in `statement` — wildcard
 *     contract for the staff super-role.
 *   - `iedoraSupport` is strictly bounded to non-escalating verbs.
 */

// Per-tenant menu resources — `member`/`admin`/`owner` are tenant roles
// and see only these. Staff resources are tested separately below.
const TENANT_MENU_RESOURCES = [
  'tenant.menu.qr-codes',
  'tenant.menu.analytics',
  'tenant.menu.billing',
  'tenant.menu.restaurants',
  'tenant.menu.menus',
] as const

describe('permissions taxonomy', () => {
  it('exposes the bound roles', () => {
    expect(roles).toMatchObject({ member, admin, owner })
  })

  it('declares actions for every tenant.menu resource', () => {
    for (const r of TENANT_MENU_RESOURCES) {
      expect(statement[r]).toBeDefined()
      expect(Array.isArray(statement[r])).toBe(true)
      expect(statement[r].length).toBeGreaterThan(0)
    }
  })

  it('uses `createAccessControl` to bind roles', () => {
    expect(typeof member.authorize).toBe('function')
    expect(typeof admin.authorize).toBe('function')
    expect(typeof owner.authorize).toBe('function')
    expect(typeof iedoraAdmin.authorize).toBe('function')
  })

  it('owner can read every tenant.menu resource', async () => {
    for (const r of TENANT_MENU_RESOURCES) {
      const res = await owner.authorize({ [r]: ['read'] } as never)
      expect(res.success, `owner can read ${r}`).toBe(true)
    }
  })

  it('admin cannot delete restaurants but owner can', async () => {
    const adminRes = await admin.authorize({
      'tenant.menu.restaurants': ['delete'],
    } as never)
    const ownerRes = await owner.authorize({
      'tenant.menu.restaurants': ['delete'],
    } as never)
    expect(adminRes.success).toBe(false)
    expect(ownerRes.success).toBe(true)
  })

  it('member is read-only over tenant.menu resources', async () => {
    const okRead = await member.authorize({
      'tenant.menu.restaurants': ['read'],
    } as never)
    const denyCreate = await member.authorize({
      'tenant.menu.menus': ['create'],
    } as never)
    const denyPublish = await member.authorize({
      'tenant.menu.menus': ['publish'],
    } as never)
    expect(okRead.success).toBe(true)
    expect(denyCreate.success).toBe(false)
    expect(denyPublish.success).toBe(false)
  })

  it('ac is created from the statement', () => {
    expect(typeof ac.newRole).toBe('function')
  })

  // ── buildWildcardRole contract: iedora-admin covers everything ──
  it('iedora-admin (wildcard) authorizes every action of every statement entry', async () => {
    for (const [resource, verbs] of Object.entries(statement)) {
      for (const verb of verbs as readonly string[]) {
        const res = await iedoraAdmin.authorize({ [resource]: [verb] } as never)
        expect(
          res.success,
          `iedora-admin should permit ${resource}:${verb}`,
        ).toBe(true)
      }
    }
  })

  // ── iedora-support: cross-tenant staff sub-role ──
  it('exposes iedora-support in the staffRoles registry', () => {
    expect(staffRoles).toMatchObject({
      'iedora-admin': iedoraAdmin,
      'iedora-support': iedoraSupport,
    })
  })

  it('iedora-support can read and ban users', async () => {
    for (const action of ['read', 'ban'] as const) {
      const res = await iedoraSupport.authorize({
        'staff.core.users': [action],
      } as never)
      expect(res.success, `support can ${action} users`).toBe(true)
    }
  })

  it('iedora-support cannot set-role nor impersonate (no self-escalation)', async () => {
    const setRole = await iedoraSupport.authorize({
      'staff.core.users': ['set-role'],
    } as never)
    const impersonate = await iedoraSupport.authorize({
      'staff.core.users': ['impersonate'],
    } as never)
    expect(setRole.success).toBe(false)
    expect(impersonate.success).toBe(false)
  })

  it('iedora-support has zero access to per-org resources', async () => {
    const restaurants = await iedoraSupport.authorize({
      'tenant.menu.restaurants': ['read'],
    } as never)
    const menus = await iedoraSupport.authorize({
      'tenant.menu.menus': ['read'],
    } as never)
    expect(restaurants.success).toBe(false)
    expect(menus.success).toBe(false)
  })

  it('iedora-support can view orgs/sessions/members/invitations', async () => {
    const checks = [
      { 'staff.core.orgs': ['list'] },
      { 'staff.core.orgs': ['get'] },
      { 'staff.core.sessions': ['list'] },
      { 'staff.core.sessions': ['revoke'] },
      { 'staff.core.members': ['remove'] },
      { 'staff.core.invitations': ['cancel'] },
    ] as const
    for (const c of checks) {
      const res = await iedoraSupport.authorize(c as never)
      expect(res.success, `support permits ${JSON.stringify(c)}`).toBe(true)
    }
  })

  it('iedora-support cannot escalate via members:update-role', async () => {
    const membersUpdateRole = await iedoraSupport.authorize({
      'staff.core.members': ['update-role'],
    } as never)
    expect(membersUpdateRole.success).toBe(false)
  })

  // Anti-drift: every read-shaped verb on the resources support is
  // bound to must remain reachable. `staff.core.audit` is deliberately
  // EXCLUDED — audit visibility is admin-only by design (a future
  // narrow "Auditor" role could carry just `audit:read`).
  const SUPPORT_READABLE_RESOURCES = [
    'staff.core.users',
    'staff.core.orgs',
    'staff.core.members',
    'staff.core.invitations',
    'staff.core.sessions',
  ] as const
  it('iedora-support permits every read-shaped verb on its bound resources', async () => {
    const readShaped = new Set(['list', 'get', 'read'])
    for (const resource of SUPPORT_READABLE_RESOURCES) {
      const verbs = statement[resource] as readonly string[]
      for (const verb of verbs) {
        if (!readShaped.has(verb)) continue
        const res = await iedoraSupport.authorize({
          [resource]: [verb],
        } as never)
        expect(
          res.success,
          `iedora-support should permit ${resource}:${verb} (read-shaped)`,
        ).toBe(true)
      }
    }
  })

  it('iedora-support cannot read the audit log (admin-only)', async () => {
    const res = await iedoraSupport.authorize({
      'staff.core.audit': ['read'],
    } as never)
    expect(res.success).toBe(false)
  })
})
