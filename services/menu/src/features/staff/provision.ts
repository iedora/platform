import { IMPORT_LIMITS, type ImportPayload, type StaffCreateRestaurant } from "@iedora/contracts";
import { ServiceClientError } from "@iedora/server-kit";

import type { MenuDeps } from "../../deps";
import type { Restaurant } from "../../domain";
import { invalid } from "../../errors";
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

  // Every item translation must target a supported language, or the public menu
  // could never show it. Caught here so the admin sees a clear 422.
  const supportedSet = new Set(supported);
  for (const menu of payload.menus) {
    for (const category of menu.categories ?? []) {
      for (const item of category.items ?? []) {
        for (const code of [...Object.keys(item.nameI18n ?? {}), ...Object.keys(item.descriptionI18n ?? {})]) {
          if (!supportedSet.has(code)) {
            throw invalid(`translation language "${code}" is not in supportedLanguages`);
          }
        }
      }
    }
  }

  const totalItems = payload.menus.reduce(
    (sum, menu) => sum + (menu.categories ?? []).reduce((n, cat) => n + (cat.items ?? []).length, 0),
    0,
  );
  if (totalItems > IMPORT_LIMITS.totalItems) {
    throw invalid(`too many items: ${totalItems} (max ${IMPORT_LIMITS.totalItems})`);
  }

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
    for (const menu of payload.menus) {
      const menuId = await createMenu(deps, restaurant.id, menu.name);
      for (const category of menu.categories ?? []) {
        const categoryId = await createCategory(deps, menuId, restaurant.id, category.name);
        // One multi-row INSERT for the whole category (freshly created, so item
        // order is the array order) instead of a round-trip per item.
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
            // Priceless dishes (market price, headers) import as 0 → the menu
            // renders no price. Variants, when present, carry their own prices.
            priceCents: item.priceCents ?? 0,
            currency: item.currency,
            available: item.available,
            tags: item.tags,
            variants: item.variants,
          })),
        );
      }
    }
    return restaurant;
  });
}
