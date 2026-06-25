import type { LocalizedText, StaffTransferOwnership } from "@iedora/contracts";
import { sql } from "kysely";

import * as builder from "./data/builder";
import { promoteDefaultLanguage } from "./data/language";
import {
  type RestaurantSummary,
  completeOnboarding as completeOnboardingRow,
  createRestaurant as createRestaurantRow,
  deleteRestaurant as deleteRestaurantRow,
  renameSlug as renameSlugRow,
  setRestaurantTenant,
  updateIdentityRow,
} from "./data/restaurants.write";
import { restaurantById, restaurantBySlug } from "./data/restaurants";
import type { MenuDeps } from "./deps";
import type { Restaurant, Variant } from "./domain";
import { invalid, notFound } from "./errors";
import { Languages } from "./i18n";
import { numbered, slugify, validSlug } from "./slug";
import {
  MAX_ITEM_NAME,
  MAX_SHORT_NAME,
  optional,
  trimmed,
  validI18n,
  validLanguages,
  validPrice,
  validTheme,
  validVariants,
} from "./validate";

// Menu use-cases — input validation, orchestration over the data layer, and
// audit on restaurant lifecycle events. Builder edits are too noisy to audit;
// lifecycle changes are the security-relevant ones.

// Print-sheet options captured on the QR audit event. Mirrors the dialog's
// QrPrintOptions plus what was printed (the branded menu QR vs a bound sticker).
export type QrPrintMeta = {
  kind: "menu" | "sticker";
  code?: string;
  pageSize: string;
  qrSizeMm: number;
  gutterMm: number;
  pageMarginMm: number;
  cutMarks: boolean;
  perSheet: number;
};

// recordQrPrint logs a "QR sheet printed" event ON THE RESTAURANT so it shows in
// the restaurant's admin audit trail. Reachable by the owner (own restaurant)
// and staff (any) via the scoped subtree; the meta carries the chosen print
// options. Best-effort by design — the frontend never blocks printing on it.
export async function recordQrPrint(
  deps: MenuDeps,
  r: { id: string; tenantId: string; slug: string; name: string },
  actorId: string,
  meta: QrPrintMeta,
): Promise<void> {
  await deps.auditor.record({
    action: "menu.restaurant.qr_printed",
    actor: { type: "user", id: actorId },
    tenantId: r.tenantId,
    targetType: "restaurant",
    targetId: r.id,
    meta: { slug: r.slug, name: r.name, ...meta },
  });
}

async function record(
  deps: MenuDeps,
  actorId: string,
  action: string,
  r: { id: string; tenantId: string; slug: string; name: string },
): Promise<void> {
  await deps.auditor.record({
    action,
    actor: { type: "user", id: actorId },
    tenantId: r.tenantId,
    targetType: "restaurant",
    targetId: r.id,
    meta: { slug: r.slug, name: r.name },
  });
}

// createRestaurant provisions a restaurant: plan gate + slug derivation with
// collision retry, both under a per-tenant advisory lock so two concurrent
// creators cannot both pass a "1 restaurant left" gate. The lock is held for the
// transaction; the unique index is still the source of truth for the slug.
export async function createRestaurant(
  deps: MenuDeps,
  tenantId: string,
  actorId: string,
  name: string,
  defaultLanguage: string,
  supportedLanguages?: string[],
  slugBase?: string,
): Promise<Restaurant> {
  name = trimmed("name", name, MAX_SHORT_NAME);
  if (defaultLanguage === "") defaultLanguage = Languages[0];
  // The default is always part of the supported set (dedup, default first).
  const supported = Array.from(new Set([defaultLanguage, ...(supportedLanguages ?? [])]));
  validLanguages(defaultLanguage, supported);
  // A custom slug overrides the name-derived one; it's slugified the same way
  // (so it matches previewSlug) and is still the BASE — numbered (base-2, …) if
  // the slug is already taken.
  const base = (slugBase ? slugify(slugBase) : "") || slugify(name) || "restaurant";

  let created: Restaurant | undefined;
  await deps.db.runInTx(async () => {
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`restaurant:${tenantId}`}))`.execute(deps.db.db);
    await deps.plans.canAddRestaurant(tenantId);
    for (let n = 1; n <= 50; n++) {
      const slug = numbered(base, n);
      // ON CONFLICT returns undefined when the slug is taken — no raised unique
      // violation, so the tx is NOT aborted and we can try the next candidate.
      const id = await createRestaurantRow(deps.db.db, {
        tenantId,
        name,
        slug,
        defaultLanguage,
        supportedLanguages: supported,
      });
      if (id === undefined) continue; // slug taken → next numbered candidate
      created = {
        id,
        tenantId,
        name,
        slug,
        description: "",
        descriptionI18n: null,
        logoUrl: "",
        bannerUrl: "",
        theme: null,
        defaultLanguage,
        supportedLanguages: supported,
        onboardingCompletedAt: null,
        updatedAt: new Date(),
      };
      // Transactional outbox: enqueue the audit event in the SAME tx as the row
      // insert (recordSync), so the "restaurant created" entry can't be lost or
      // exist without the restaurant. The relay ships it to the audit service.
      await deps.auditor.recordSync({
        action: "menu.restaurant.created",
        actor: { type: "user", id: actorId },
        tenantId: created.tenantId,
        targetType: "restaurant",
        targetId: created.id,
        meta: { slug: created.slug, name: created.name, defaultLanguage: created.defaultLanguage },
      });
      return;
    }
    throw invalid(`could not allocate a slug for "${base}"`);
  });
  return created!;
}

// previewSlug resolves the slug a create would actually assign for a desired
// base: the base itself if free, else the next numbered candidate. Advisory
// only (the unique index is the real guard), so a slug can still be claimed
// between preview and insert — the create path numbers it then anyway.
export async function previewSlug(
  deps: MenuDeps,
  desired: string,
): Promise<{ valid: boolean; slug: string; available: boolean }> {
  const base = slugify(desired);
  if (!validSlug(base)) return { valid: false, slug: base, available: false };
  for (let n = 1; n <= 50; n++) {
    const slug = numbered(base, n);
    if (!(await restaurantBySlug(deps.db.db, slug))) {
      return { valid: true, slug, available: n === 1 };
    }
  }
  return { valid: true, slug: base, available: false };
}

// transferRestaurant moves a restaurant's ownership. "existing": re-parent ONLY
// this restaurant into the target tenant, plan-gated on that target. "new":
// create a user and hand them the whole current tenant (auth side) — the
// restaurant stays put but its tenant's owner changes. Either way it emits an
// audit event ON THE RESTAURANT so the transfer shows in its audit log.
export async function transferRestaurant(
  deps: MenuDeps,
  id: string,
  actorId: string,
  input: StaffTransferOwnership,
): Promise<void> {
  const r = await restaurantById(deps.db.db, id);
  if (!r) throw notFound();

  if (input.mode === "existing") {
    if (input.tenantId === r.tenantId) throw invalid("the restaurant already belongs to that tenant");
    await deps.db.runInTx(async () => {
      // Plan gate on the TARGET tenant (On Us holds 1 restaurant; full → needs Kasa).
      await deps.plans.canAddRestaurant(input.tenantId);
      await setRestaurantTenant(deps.db.db, id, input.tenantId);
      await deps.auditor.recordSync({
        action: "menu.restaurant.owner_transferred",
        actor: { type: "user", id: actorId },
        tenantId: input.tenantId,
        targetType: "restaurant",
        targetId: r.id,
        meta: { slug: r.slug, name: r.name, fromTenant: r.tenantId, toTenant: input.tenantId, mode: "existing" },
      });
    });
    return;
  }

  // "new": auth creates the user + swaps the current tenant's owner. The
  // restaurant's tenant_id is unchanged; the tenant simply gets a new owner.
  const { ownerId } = await deps.tenant.transferToNewOwner(r.tenantId, {
    email: input.email,
    name: input.name,
    password: input.password,
  });
  await deps.auditor.record({
    action: "menu.restaurant.owner_transferred",
    actor: { type: "user", id: actorId },
    tenantId: r.tenantId,
    targetType: "restaurant",
    targetId: r.id,
    meta: { slug: r.slug, name: r.name, newOwnerEmail: input.email, newOwnerId: ownerId, mode: "new" },
  });
}

// transferEligibility: can the target tenant receive another restaurant under
// its plan? Advisory (the transfer re-checks) — powers the picker's availability.
export async function transferEligibility(
  deps: MenuDeps,
  targetTenantId: string,
): Promise<{ eligible: boolean }> {
  try {
    await deps.plans.canAddRestaurant(targetTenantId);
    return { eligible: true };
  } catch {
    return { eligible: false };
  }
}

export interface IdentityPatch {
  name?: string;
  description?: string;
  descriptionI18n?: LocalizedText;
  theme?: Record<string, unknown>;
  defaultLanguage?: string;
  supportedLanguages?: string[];
}

// updateIdentity applies a patch. Changing the default language atomically
// rotates all content (promoteDefaultLanguage) within the same transaction.
export async function updateIdentity(
  deps: MenuDeps,
  r: Restaurant,
  p: IdentityPatch,
): Promise<Restaurant> {
  const next: Restaurant = { ...r };
  // Language config first: i18n validation strips overrides for the (final)
  // default, so the default must be settled before they're checked.
  if (p.defaultLanguage !== undefined) next.defaultLanguage = p.defaultLanguage;
  if (p.supportedLanguages !== undefined) next.supportedLanguages = p.supportedLanguages;
  validLanguages(next.defaultLanguage, next.supportedLanguages);

  if (p.name !== undefined) next.name = trimmed("name", p.name, MAX_SHORT_NAME);
  if (p.description !== undefined) next.description = optional("description", p.description, 1000);
  if (p.descriptionI18n !== undefined) {
    next.descriptionI18n = validI18n("description", p.descriptionI18n, next.defaultLanguage);
  }
  if (p.theme !== undefined) {
    validTheme(p.theme);
    next.theme = p.theme;
  }

  const promoteFrom = next.defaultLanguage !== r.defaultLanguage ? r.defaultLanguage : "";
  return deps.db.runInTx(async () => {
    if (promoteFrom !== "") {
      await promoteDefaultLanguage(deps.db.db, r.id, promoteFrom, next.defaultLanguage);
    }
    return updateIdentityRow(deps.db.db, next, promoteFrom !== "");
  });
}

export async function renameSlug(
  deps: MenuDeps,
  r: Restaurant,
  actorId: string,
  slug: string,
): Promise<void> {
  if (!validSlug(slug)) throw invalid("slug must be 2-40 lowercase letters, digits or dashes");
  await renameSlugRow(deps.db.db, r.id, slug);
  await record(deps, actorId, "menu.restaurant.slug_renamed", { ...r, slug });
}

// staffSetName is the staff-only identity override: a privileged rename of the
// friendly name from the admin surface (cross-tenant), distinct from the
// owner-scoped updateIdentity. Audited so the change shows in the restaurant's
// own trail with the staff actor.
export async function staffSetName(
  deps: MenuDeps,
  r: Restaurant,
  actorId: string,
  name: string,
): Promise<Restaurant> {
  const next: Restaurant = { ...r, name: trimmed("name", name, MAX_SHORT_NAME) };
  const updated = await updateIdentityRow(deps.db.db, next, false);
  await record(deps, actorId, "menu.restaurant.renamed", updated);
  return updated;
}

export function completeOnboarding(deps: MenuDeps, r: Restaurant): Promise<void> {
  return completeOnboardingRow(deps.db.db, r.id);
}

export async function deleteRestaurant(deps: MenuDeps, r: Restaurant, actorId: string): Promise<void> {
  await deleteRestaurantRow(deps.db.db, r.id, r.tenantId);
  await record(deps, actorId, "menu.restaurant.deleted", r);
}

// --- builder use-cases (validate, then delegate to the tenancy-guarded store) ---

interface TextFields {
  name: string;
  nameI18n?: LocalizedText;
  description?: string;
  descriptionI18n?: LocalizedText;
}

function normalizeText(t: TextFields, defaultLang: string) {
  return {
    name: trimmed("name", t.name, MAX_SHORT_NAME),
    description: optional("description", t.description ?? "", 1000),
    nameI18n: validI18n("name", t.nameI18n, defaultLang),
    descI18n: validI18n("description", t.descriptionI18n, defaultLang),
  };
}

export function createMenu(deps: MenuDeps, restaurantId: string, name: string): Promise<string> {
  return builder.createMenu(deps.db.db, restaurantId, trimmed("name", name, MAX_SHORT_NAME));
}

export function updateMenu(
  deps: MenuDeps,
  menuId: string,
  restaurantId: string,
  defaultLang: string,
  u: TextFields & { active: boolean },
): Promise<void> {
  const n = normalizeText(u, defaultLang);
  return builder.updateMenu(deps.db.db, menuId, restaurantId, n.name, n.description, n.nameI18n, n.descI18n, u.active);
}

export function deleteMenu(deps: MenuDeps, menuId: string, restaurantId: string): Promise<void> {
  return builder.deleteMenu(deps.db.db, menuId, restaurantId);
}

export function createCategory(
  deps: MenuDeps,
  menuId: string,
  restaurantId: string,
  name: string,
): Promise<string> {
  return builder.createCategory(deps.db.db, menuId, restaurantId, trimmed("name", name, MAX_SHORT_NAME));
}

export function updateCategory(
  deps: MenuDeps,
  categoryId: string,
  restaurantId: string,
  defaultLang: string,
  u: TextFields,
): Promise<void> {
  const n = normalizeText(u, defaultLang);
  return builder.updateCategory(deps.db.db, categoryId, restaurantId, n.name, n.description, n.nameI18n, n.descI18n);
}

export function deleteCategory(deps: MenuDeps, categoryId: string, restaurantId: string): Promise<void> {
  return builder.deleteCategory(deps.db.db, categoryId, restaurantId);
}

export interface ItemWrite {
  name: string;
  nameI18n?: LocalizedText;
  description?: string;
  descriptionI18n?: LocalizedText;
  priceCents: number;
  currency?: string;
  available?: boolean;
  tags?: string[];
  variants?: Variant[];
}

function normalizeItem(w: ItemWrite, defaultLang: string): builder.ItemInput {
  if ((w.tags?.length ?? 0) > 20) throw invalid("too many tags");
  validPrice("price", w.priceCents);
  return {
    name: trimmed("name", w.name, MAX_ITEM_NAME),
    description: optional("description", w.description ?? "", 1000),
    nameI18n: validI18n("name", w.nameI18n, defaultLang),
    descriptionI18n: validI18n("description", w.descriptionI18n, defaultLang),
    priceCents: w.priceCents,
    currency: w.currency || "EUR",
    available: w.available ?? true,
    tags: w.tags ?? [],
    variants: validVariants(w.variants, defaultLang),
  };
}

export function createItem(
  deps: MenuDeps,
  categoryId: string,
  restaurantId: string,
  defaultLang: string,
  w: ItemWrite,
): Promise<string> {
  return builder.createItem(deps.db.db, categoryId, restaurantId, normalizeItem(w, defaultLang));
}

export function updateItem(
  deps: MenuDeps,
  itemId: string,
  restaurantId: string,
  defaultLang: string,
  w: ItemWrite,
): Promise<void> {
  // nil = leave stored variants alone; non-nil (even empty) = replace.
  return builder.updateItem(deps.db.db, itemId, restaurantId, normalizeItem(w, defaultLang), w.variants != null);
}

export function deleteItem(deps: MenuDeps, itemId: string, restaurantId: string): Promise<void> {
  return builder.deleteItem(deps.db.db, itemId, restaurantId);
}

export function reorderCategories(
  deps: MenuDeps,
  menuId: string,
  restaurantId: string,
  orderedIds: string[],
): Promise<void> {
  return builder.reorderCategories(deps.db.db, menuId, restaurantId, orderedIds);
}

export function reorderItems(
  deps: MenuDeps,
  categoryId: string,
  restaurantId: string,
  orderedIds: string[],
): Promise<void> {
  return builder.reorderItems(deps.db.db, categoryId, restaurantId, orderedIds);
}

export type { RestaurantSummary };
