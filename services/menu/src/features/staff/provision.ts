import {
  IMPORT_LIMITS,
  type ImportItem,
  type ImportMenu,
  type ImportPayload,
  type StaffCreateRestaurant,
} from "@iedora/contracts";
import { ServiceClientError } from "@iedora/service-runtime";

import { deleteAllMenus } from "../../data/builder";
import { restaurantById } from "../../data/restaurants";
import { menuTree } from "../../data/tree";
import type { ItemNode, Node, Restaurant } from "../../domain";
import type { MenuDeps } from "../../deps";
import { invalid, notFound } from "../../errors";
import { Languages } from "../../i18n";
import { createCategory, createItems, createMenu, createRestaurant } from "../../service";
import { validLanguages } from "../../validate";

// Staff provisioning of a restaurant (admin "New restaurant"): resolve the
// target tenant (existing, or a brand-new one owned by the acting admin), then
// create the restaurant and — for a JSON import — its full menu tree.
//
// Ordering matters for the red paths: everything that can fail cheaply (language,
// item budget) is checked BEFORE the cross-service tenant write, so a bad payload
// never leaves an orphan tenant behind. The restaurant + menu tree then write in
// one menu-DB transaction, so a mid-import failure rolls all of it back.

/** Resolve the tenant the new restaurant lands in. A new tenant name wins over
 * an existing id; auth's 422 (bad name) becomes our 422. */
async function resolveTenant(
  deps: MenuDeps,
  actorId: string,
  opts: { tenantId?: string; newTenantName?: string },
): Promise<string> {
  if (opts.newTenantName) {
    try {
      const created = await deps.tenant.createTenant(opts.newTenantName, actorId);
      return created.id;
    } catch (err) {
      if (err instanceof ServiceClientError && err.status === 422) throw invalid("invalid tenant name");
      throw err;
    }
  }
  if (opts.tenantId) {
    // The tenant must exist (and have an owner) — otherwise the restaurant insert
    // would 500 on a foreign-key violation. Surface a clean 422 instead.
    if (!(await deps.tenant.tenant(opts.tenantId))) throw invalid("tenant not found");
    return opts.tenantId;
  }
  throw invalid("a tenant is required");
}

/** Validate a default language up front (before any tenant write) so a typo'd
 * language can't orphan a freshly created tenant. Empty means "service default". */
function assertLanguage(lang: string | undefined): void {
  const code = (lang ?? "").trim();
  if (code) validLanguages(code, [code]);
}

/** Every item translation must target a language the menu offers — otherwise the
 *  public menu could never show it. Throws a clean 422. */
function assertTranslationsSupported(menus: ImportMenu[], supported: Set<string>): void {
  for (const menu of menus) {
    for (const category of menu.categories ?? []) {
      for (const item of category.items ?? []) {
        for (const code of [...Object.keys(item.nameI18n ?? {}), ...Object.keys(item.descriptionI18n ?? {})]) {
          if (!supported.has(code)) throw invalid(`translation language "${code}" is not in supportedLanguages`);
        }
      }
    }
  }
}

/** Total item count across the document — bounded so one runaway payload can't
 *  stream thousands of rows into a single transaction. */
function countItems(menus: ImportMenu[]): number {
  const total = menus.reduce(
    (sum, menu) => sum + (menu.categories ?? []).reduce((n, cat) => n + (cat.items ?? []).length, 0),
    0,
  );
  if (total > IMPORT_LIMITS.totalItems) {
    throw invalid(`too many items: ${total} (max ${IMPORT_LIMITS.totalItems})`);
  }
  return total;
}

/** Writes a validated menu tree under a restaurant. One multi-row INSERT per
 *  category (freshly created, so item order is the array order). Shared by the
 *  initial import and the admin JSON replace. */
async function writeMenuTree(deps: MenuDeps, restaurant: Restaurant, menus: ImportMenu[]): Promise<void> {
  for (const menu of menus) {
    const menuId = await createMenu(deps, restaurant.id, menu.name);
    for (const category of menu.categories ?? []) {
      const categoryId = await createCategory(deps, menuId, restaurant.id, category.name);
      await createItems(
        deps,
        categoryId,
        restaurant.id,
        restaurant.defaultLanguage,
        restaurant.defaultCurrency,
        (category.items ?? []).map((item) => ({
          name: item.name,
          nameI18n: item.nameI18n,
          description: item.description,
          descriptionI18n: item.descriptionI18n,
          // Priceless dishes (market price, headers) store 0 → no price shown.
          priceCents: item.priceCents ?? 0,
          currency: item.currency,
          available: item.available,
          tags: item.tags,
          variants: item.variants,
        })),
      );
    }
  }
}

export function staffCreateRestaurant(
  deps: MenuDeps,
  actorId: string,
  input: StaffCreateRestaurant,
): Promise<Restaurant> {
  assertLanguage(input.defaultLanguage);
  return resolveTenant(deps, actorId, {
    tenantId: input.tenantId,
    newTenantName: input.newTenantName,
  }).then((tenantId) =>
    createRestaurant(deps, tenantId, actorId, input.name, input.defaultLanguage ?? "", undefined, input.slug),
  );
}

export async function staffImportRestaurant(
  deps: MenuDeps,
  actorId: string,
  input: { tenantId?: string; payload: ImportPayload },
): Promise<Restaurant> {
  const { payload } = input;

  // Resolve the language set up front (the default is always included) and
  // validate it before any write — a bad language must not orphan a tenant.
  const defaultLang = (payload.restaurant.defaultLanguage ?? "").trim() || Languages[0]!;
  const supported = Array.from(new Set([defaultLang, ...(payload.restaurant.supportedLanguages ?? [])]));
  validLanguages(defaultLang, supported);

  // Caught here so the admin sees a clear 422 before any write.
  assertTranslationsSupported(payload.menus, new Set(supported));
  countItems(payload.menus);

  const tenantId = await resolveTenant(deps, actorId, {
    tenantId: input.tenantId,
    newTenantName: payload.tenant,
  });

  // One transaction: createRestaurant's own runInTx nests into this one, so a
  // failure anywhere in the tree rolls back the restaurant too — no half-imported
  // restaurant survives.
  return deps.db.runInTx(async () => {
    const restaurant = await createRestaurant(
      deps,
      tenantId,
      actorId,
      payload.restaurant.name,
      defaultLang,
      supported,
      payload.restaurant.slug,
    );
    await writeMenuTree(deps, restaurant, payload.menus);
    return restaurant;
  });
}

/** Serializes a restaurant's full menu tree (all menus, hidden + inactive
 *  included) into the same shape the JSON importer accepts, so the admin editor
 *  can load the live menu, edit it, and save it back. Optional/empty fields are
 *  dropped to keep the document clean (priceless items carry no price). */
export async function staffExportMenus(
  deps: MenuDeps,
  restaurantId: string,
): Promise<{ menus: ImportMenu[] }> {
  const restaurant = await restaurantById(deps.db.db, restaurantId);
  if (!restaurant) throw notFound();
  const tree = await menuTree(deps.db.db, restaurantId, false);
  return { menus: tree.map(toImportMenu) };
}

/** Replaces a restaurant's entire menu tree from a JSON document (admin bulk
 *  edit). Validates against the restaurant's own languages + item budget, then
 *  in one transaction drops the existing menus and writes the new tree.
 *  Destructive by design (item ids are not preserved). */
export async function staffReplaceMenus(
  deps: MenuDeps,
  restaurantId: string,
  menus: ImportMenu[],
): Promise<void> {
  const restaurant = await restaurantById(deps.db.db, restaurantId);
  if (!restaurant) throw notFound();
  assertTranslationsSupported(menus, new Set([restaurant.defaultLanguage, ...restaurant.supportedLanguages]));
  countItems(menus);
  await deps.db.runInTx(async () => {
    await deleteAllMenus(deps.db.db, restaurantId);
    await writeMenuTree(deps, restaurant, menus);
  });
}

const nonEmpty = (m: ItemNode["nameI18n"] | undefined) =>
  m && Object.keys(m).length > 0 ? m : undefined;

function toImportItem(it: ItemNode): ImportItem {
  return {
    name: it.name,
    nameI18n: nonEmpty(it.nameI18n),
    description: it.description || undefined,
    descriptionI18n: nonEmpty(it.descriptionI18n),
    currency: it.currency,
    // Hidden items round-trip as available:false; visible ones omit it (default).
    available: it.available ? undefined : false,
    tags: it.tags.length > 0 ? it.tags : undefined,
    // Variants drive the price when present; otherwise a non-zero price; a
    // priceless item carries neither.
    ...(it.variants.length > 0
      ? {
          variants: it.variants.map((v) => ({
            label: v.label,
            labelI18n: nonEmpty(v.labelI18n),
            priceCents: v.priceCents,
          })),
        }
      : it.priceCents > 0
        ? { priceCents: it.priceCents }
        : {}),
  };
}

function toImportMenu(m: Node): ImportMenu {
  return {
    name: m.name,
    categories: m.categories.map((c) => ({
      name: c.name,
      items: c.items.map(toImportItem),
    })),
  };
}
