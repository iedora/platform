'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { ImportPayload } from '@iedora/contracts'
import { ApiError } from '@iedora/api-client'
import * as api from '../../shared/api'
import { requireStaff } from '../auth'
import { LANGUAGE_CODES, type LanguageCode } from '../i18n'
import { localizedSchema, pruneLocalized } from '../i18n/server'
import { revalidateRestaurant } from '../menu-publishing'
import { FONTS, HEX_PATTERN, LAYOUTS } from '../menu-publishing/rsc/theme'
import { isValidSlugShape } from '../restaurant-slug'

/**
 * Server action shells — thin wrappers over the menu API's identity
 * PATCH. The service owns authorization (Bearer token + slug scope),
 * persistence and the default-language promotion; the zod parses here
 * only keep garbage out of the wire format so the editor gets a
 * friendly message instead of a generic 400.
 *
 * Every mutation that affects the public menu calls
 * `revalidateRestaurant` (AGENTS.md hard rule #12); path-based
 * revalidation on the dashboard side is kept as a belt-and-suspenders
 * guard until tag-only invalidation is fully rolled out.
 */

type ActionResult = { ok: true } | { ok: false; error: string }

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong'
}

function revalidateIdentityPages(slug: string) {
  revalidatePath(`/menu/dashboard/r/${slug}`)
  revalidatePath(`/menu/dashboard/r/${slug}/theme`)
  revalidateRestaurant(slug)
}

// LAYOUTS comes from the templates registry (AGENTS.md hard rule #8) — the
// enum here is derived at module load, so adding a template just shows up.
const ThemeInput = z.object({
  layout: z.enum(LAYOUTS.map((l) => l.id) as [string, ...string[]]),
  font: z.enum(FONTS.map((f) => f.id) as [string, ...string[]]),
  primaryColor: z.string().regex(HEX_PATTERN, 'Must be a #RRGGBB hex color'),
  secondaryColor: z.string().regex(HEX_PATTERN, 'Must be a #RRGGBB hex color'),
})

export async function updateTheme(slug: string, input: unknown): Promise<ActionResult> {
  const parsed = ThemeInput.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid theme' }
  }
  try {
    await api.updateIdentity(slug, { theme: parsed.data })
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
  revalidateIdentityPages(slug)
  return { ok: true }
}

// defaultLanguage MUST be in supportedLanguages so the fallback chain
// always has something to land on. The service performs the
// promote-on-switch rotation (source column ↔ i18n slot) when the
// default changes.
const LanguageInput = z
  .object({
    defaultLanguage: z.enum(LANGUAGE_CODES as unknown as [LanguageCode, ...LanguageCode[]]),
    supportedLanguages: z
      .array(z.enum(LANGUAGE_CODES as unknown as [LanguageCode, ...LanguageCode[]]))
      .min(1, 'Pick at least one language'),
  })
  .refine((d) => d.supportedLanguages.includes(d.defaultLanguage), {
    message: 'Default language must be in the supported set',
    path: ['defaultLanguage'],
  })

export async function updateLanguageSettings(
  slug: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = LanguageInput.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid language settings',
    }
  }
  try {
    await api.updateIdentity(slug, {
      defaultLanguage: parsed.data.defaultLanguage,
      // Dedupe + keep declarative order from input.
      supportedLanguages: Array.from(new Set(parsed.data.supportedLanguages)),
    })
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
  revalidateIdentityPages(slug)
  return { ok: true }
}

// Empty strings collapse to undefined so the row doesn't carry "" values
// that the renderer would treat as truthy and try to render. Logo/banner
// are managed by the ImageUpload component (features/upload/actions).
const IdentityInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === '' ? undefined : v)),
  descriptionI18n: localizedSchema,
})

export async function updateIdentity(slug: string, input: unknown): Promise<ActionResult> {
  const parsed = IdentityInput.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  try {
    await api.updateIdentity(slug, {
      name: parsed.data.name,
      description: parsed.data.description,
      descriptionI18n: pruneLocalized(parsed.data.descriptionI18n) ?? undefined,
    })
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
  revalidateIdentityPages(slug)
  return { ok: true }
}

/**
 * Rename the public URL slug. The service validates the shape and
 * 409s when the slug is taken. The action returns the new slug on
 * success so the client can `router.replace(/dashboard/r/<new>)` —
 * the old dashboard URL would 404 on next render because the slug no
 * longer resolves.
 */
export async function updateSlug(
  currentSlug: string,
  nextSlug: unknown,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const next = typeof nextSlug === 'string' ? nextSlug.trim().toLowerCase() : ''
  if (!isValidSlugShape(next)) {
    return { ok: false, error: 'Use 2–40 lowercase letters, numbers, and hyphens.' }
  }
  try {
    await api.renameSlug(currentSlug, next)
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { ok: false, error: 'That URL is already taken.' }
    }
    return { ok: false, error: errorMessage(err) }
  }

  // Invalidate BOTH slugs — the old one's snapshot is now orphaned, the
  // new one has none yet.
  revalidateIdentityPages(currentSlug)
  revalidateIdentityPages(next)

  return { ok: true, slug: next }
}

// --- staff provisioning (admin "New restaurant") ---

// On success the action returns the new restaurant id so the client can route to
// its detail page; on failure it returns an i18n key the form resolves.
type ProvisionResult = { ok: true; id: string } | { ok: false; error: string }

function provisionErrorKey(err: unknown): string {
  if (err instanceof ApiError) return err.status === 422 ? 'invalidInput' : 'failed'
  return 'failed'
}

// A restaurant is provisioned under an existing tenant (`tenantId`) or a new one
// (`newTenantName`) — exactly one. The service re-validates; this keeps obvious
// garbage off the wire so the form shows a friendly message instead of a 422.
const StaffCreateInput = z
  .object({
    name: z.string().trim().min(1, 'nameRequired').max(120),
    defaultLanguage: z.string().trim().min(2).max(10).optional(),
    tenantId: z.string().trim().min(1).optional(),
    newTenantName: z.string().trim().min(1).max(120).optional(),
  })
  .refine((d) => Boolean(d.tenantId) !== Boolean(d.newTenantName), {
    message: 'tenantRequired',
    path: ['tenantId'],
  })

export async function staffCreateRestaurantAction(input: unknown): Promise<ProvisionResult> {
  await requireStaff()
  const parsed = StaffCreateInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalidInput' }
  try {
    const { restaurant } = await api.staffCreateRestaurant(parsed.data)
    revalidatePath('/menu/dashboard/admin/restaurants')
    return { ok: true, id: restaurant.id }
  } catch (err) {
    return { ok: false, error: provisionErrorKey(err) }
  }
}

// Import mode: the admin pastes a JSON document. We parse it here (so malformed
// JSON gets a clean message, not a 500) and hand the structure to the service,
// which owns the real validation + the menu-tree write.
export async function staffImportRestaurantAction(input: {
  tenantId?: string
  newTenantName?: string
  payloadText: string
}): Promise<ProvisionResult> {
  await requireStaff()
  let payload: unknown
  try {
    payload = JSON.parse(input.payloadText)
  } catch {
    return { ok: false, error: 'invalidJson' }
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, error: 'invalidJson' }
  }
  // The shared tenant picker drives both modes: a "new tenant" choice maps onto
  // the payload's `tenant` name, unless the JSON already names one (which wins).
  const doc = payload as ImportPayload & { tenant?: string }
  const newTenantName = input.newTenantName?.trim()
  if (newTenantName && !doc.tenant) doc.tenant = newTenantName
  try {
    const { restaurant } = await api.staffImportRestaurant({
      tenantId: newTenantName || doc.tenant ? undefined : input.tenantId?.trim() || undefined,
      payload: doc,
    })
    revalidatePath('/menu/dashboard/admin/restaurants')
    return { ok: true, id: restaurant.id }
  } catch (err) {
    return { ok: false, error: provisionErrorKey(err) }
  }
}

const StaffNameInput = z.object({ name: z.string().trim().min(1, 'Enter a name.').max(80) })

/**
 * Staff identity override — a privileged rename of a restaurant's friendly name
 * from the admin surface, addressed cross-tenant by id. `requireStaff` gates the
 * action (the menu service re-checks STAFF_ROLE and audits the change); the
 * admin pages are revalidated so the new name shows immediately.
 */
export async function staffRenameRestaurant(id: string, input: unknown): Promise<ActionResult> {
  await requireStaff()
  const parsed = StaffNameInput.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }
  try {
    await api.staffUpdateRestaurant(id, { name: parsed.data.name })
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
  const base = `/menu/dashboard/admin/restaurants/${id}`
  revalidatePath(base)
  revalidatePath(`${base}/edit`)
  revalidatePath(`${base}/payments`)
  return { ok: true }
}
