import 'server-only'
import { randomBytes } from 'node:crypto'

/**
 * Identity-side seed surface. Orgs live in Zitadel (not in menu's DB), so
 * "seeding" here means registering a mapping in the Zitadel test shim
 * (`tests/e2e/_bootstrap.ts`). After `bindUserToOrg`, the auth slice's
 * `getEffectiveOrganizationId(userId)` resolves to the supplied org id.
 *
 * Use the returned `organizationId` when calling
 * `@/features/auth/testing/signInAs({ organizationId })` and when seeding
 * tenant-scoped rows (`@/features/restaurant-identity/testing`).
 */

const SHIM_URL = process.env.ZITADEL_ISSUER_URL ?? 'http://127.0.0.1:4444'

export type SeededOrg = {
  organizationId: string
  name: string
}

/**
 * Allocate a fresh org id. Pure id generation — the shim only learns
 * about it when `bindUserToOrg` is called. Pass `id` to use a stable
 * value (handy for journeys that name orgs explicitly).
 */
export function seedOrg(
  opts: { id?: string; name?: string } = {},
): SeededOrg {
  const organizationId = opts.id ?? `org_${randomBytes(6).toString('hex')}`
  const name = opts.name ?? organizationId
  return { organizationId, name }
}

/**
 * Tell the Zitadel shim "userId belongs to organizationId". Subsequent
 * `ListUserMetadata` calls (made by the production identity adapter)
 * will return this org as primaryOrgId.
 */
export async function bindUserToOrg(
  userId: string,
  org: SeededOrg | string,
): Promise<void> {
  const organizationId = typeof org === 'string' ? org : org.organizationId
  const name = typeof org === 'string' ? organizationId : org.name
  const res = await fetch(`${SHIM_URL}/test/user-orgs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, organizationId, name }),
  })
  if (!res.ok) {
    throw new Error(
      `bindUserToOrg failed (${res.status}): ${await res.text().catch(() => '')}`,
    )
  }
}

/** Reset every shim registration. Use in afterEach when the test mutated state. */
export async function resetShim(): Promise<void> {
  const res = await fetch(`${SHIM_URL}/test/reset`, { method: 'POST' })
  if (!res.ok) throw new Error(`resetShim failed: ${res.status}`)
}
