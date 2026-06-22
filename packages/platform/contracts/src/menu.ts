import { z } from "zod";

// The menu service wire format. The menu service validates its
// requests/responses against these; the public React page and the dashboard
// consume the inferred types (Phase 4 swaps products/menu onto them).

// --- shared scalars ---

// language code → translated value for one field; only non-default languages.
export const localizedText = z.record(z.string(), z.string());
export type LocalizedText = z.infer<typeof localizedText>;

// Public-page styling; schemaless passthrough (known keys validated on write).
export const theme = z.record(z.string(), z.unknown());
export type Theme = z.infer<typeof theme>;

// --- public read model (one language, no i18n maps) ---

export const publicVariant = z.object({
  label: z.string(),
  priceCents: z.number().int(),
});
export type PublicVariant = z.infer<typeof publicVariant>;

export const publicItem = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  priceCents: z.number().int(),
  currency: z.string(),
  imageUrl: z.string().optional(),
  tags: z.array(z.string()),
  variants: z.array(publicVariant),
});
export type PublicItem = z.infer<typeof publicItem>;

export const publicCategory = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  items: z.array(publicItem),
});
export type PublicCategory = z.infer<typeof publicCategory>;

export const publicMenu = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  categories: z.array(publicCategory),
});
export type PublicMenu = z.infer<typeof publicMenu>;

// GET /public/r/{slug} — the localized public payload the menu page renders.
export const publicPayload = z.object({
  restaurant: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    logoUrl: z.string().optional(),
    bannerUrl: z.string().optional(),
    theme: theme.optional(),
  }),
  menus: z.array(publicMenu),
  defaultLanguage: z.string(),
  supportedLanguages: z.array(z.string()),
  currentLanguage: z.string(),
});
export type PublicPayload = z.infer<typeof publicPayload>;
/** Alias matching the frontend's historical name for {@link publicPayload}. */
export type PublicMenuPayload = PublicPayload;

// --- admin content model (the raw tree with i18n maps; the dashboard builder) ---

export const variant = z.object({
  label: z.string(),
  labelI18n: localizedText.optional(),
  priceCents: z.number().int(),
});
export type Variant = z.infer<typeof variant>;

export const restaurant = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  descriptionI18n: localizedText.optional(),
  logoUrl: z.string().optional(),
  bannerUrl: z.string().optional(),
  theme: theme.optional(),
  defaultLanguage: z.string(),
  supportedLanguages: z.array(z.string()),
  onboardingCompletedAt: z.string().optional(),
  updatedAt: z.string(),
});
export type Restaurant = z.infer<typeof restaurant>;

export const itemNode = z.object({
  id: z.string(),
  categoryId: z.string(),
  name: z.string(),
  nameI18n: localizedText.optional(),
  description: z.string().optional(),
  descriptionI18n: localizedText.optional(),
  priceCents: z.number().int(),
  currency: z.string(),
  imageUrl: z.string().optional(),
  position: z.number().int(),
  available: z.boolean(),
  tags: z.array(z.string()),
  variants: z.array(variant),
});
export type ItemNode = z.infer<typeof itemNode>;

export const categoryNode = z.object({
  id: z.string(),
  menuId: z.string(),
  name: z.string(),
  nameI18n: localizedText.optional(),
  description: z.string().optional(),
  descriptionI18n: localizedText.optional(),
  position: z.number().int(),
  items: z.array(itemNode),
});
export type CategoryNode = z.infer<typeof categoryNode>;

export const menuNode = z.object({
  id: z.string(),
  name: z.string(),
  nameI18n: localizedText.optional(),
  description: z.string().optional(),
  descriptionI18n: localizedText.optional(),
  position: z.number().int(),
  active: z.boolean(),
  categories: z.array(categoryNode),
});
export type MenuNode = z.infer<typeof menuNode>;

// --- dashboard aggregates ---

export const restaurantSummary = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  updatedAt: z.string(),
  menuCount: z.number().int(),
  dishCount: z.number().int(),
});
export type RestaurantSummary = z.infer<typeof restaurantSummary>;

export const menuSummary = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
  position: z.number().int(),
  updatedAt: z.string(),
  categoryCount: z.number().int(),
  dishCount: z.number().int(),
});
export type MenuSummary = z.infer<typeof menuSummary>;

export const planLimits = z.object({
  code: z.string(),
  restaurants: z.number().int(), // -1 = unlimited
  monthlyViews: z.number().int(),
  aiGenerationsWeek: z.number().int(),
});
export type PlanLimits = z.infer<typeof planLimits>;

export const dailyPoint = z.object({ day: z.string(), count: z.number().int() });
export type DailyPoint = z.infer<typeof dailyPoint>;

export const topDish = z.object({
  itemId: z.string(),
  itemName: z.string(),
  viewCount: z.number().int(),
});
export type TopDish = z.infer<typeof topDish>;

export const analytics = z.object({
  range: z.string(),
  totalScans: z.number().int(),
  todayScans: z.number().int(),
  dailyBreakdown: z.array(dailyPoint),
  menus: z.object({ total: z.number().int(), active: z.number().int() }),
  dishes: z.object({ total: z.number().int(), lastAddedAt: z.string().nullable() }),
  languages: z.array(z.string()),
  // Per-item engagement + guest dwell time (Pencil "Top dishes" / "Avg. time").
  topDishes: z.array(topDish),
  avgSessionSeconds: z.number().int().nullable(),
});
export type Analytics = z.infer<typeof analytics>;

// --- staff (cross-tenant) read models. NOTE: the row carries `menus`/`items`
// (the service's field names), not `menuCount`/`dishCount`. ---

export const staffRestaurantRow = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  slug: z.string(),
  menus: z.number().int(),
  items: z.number().int(),
  views30d: z.number().int(),
  createdAt: z.string(),
});
export type StaffRestaurantRow = z.infer<typeof staffRestaurantRow>;

export const staffOverview = z.object({
  restaurants: z.number().int(),
  activeMenus: z.number().int(),
  items: z.number().int(),
  viewsToday: z.number().int(),
  views30d: z.number().int(),
  qrBound: z.number().int(),
  qrUnbound: z.number().int(),
  topByViews: z.array(staffRestaurantRow),
});
export type StaffOverview = z.infer<typeof staffOverview>;

export const staffRestaurantDetail = z.object({
  restaurant: staffRestaurantRow,
  menus: z.array(menuSummary),
  trend: z.array(dailyPoint),
});
export type StaffRestaurantDetail = z.infer<typeof staffRestaurantDetail>;

export const staffAlerts = z.object({
  staleRestaurants: z.array(staffRestaurantRow),
  emptyMenus: z.array(staffRestaurantRow),
  unboundQr: z.number().int(),
});
export type StaffAlerts = z.infer<typeof staffAlerts>;

export const qrCode = z.object({
  code: z.string(),
  restaurantId: z.string().optional(),
  restaurantName: z.string().optional(),
  restaurantSlug: z.string().optional(),
  label: z.string().optional(),
  boundAt: z.string().optional(),
  createdAt: z.string(),
});
export type QRCode = z.infer<typeof qrCode>;

export const restaurantRef = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  slug: z.string(),
});
export type RestaurantRef = z.infer<typeof restaurantRef>;

// --- uploads ---

export const uploadTarget = z.enum([
  "restaurant-logo",
  "restaurant-banner",
  "item-photo",
  "menu-import-photo",
]);
export type UploadTarget = z.infer<typeof uploadTarget>;

export const presignedUpload = z.object({
  uploadUrl: z.string(),
  publicUrl: z.string(),
  key: z.string(),
  expiresInSeconds: z.number().int(),
  maxBytes: z.number().int(),
});
export type PresignedUpload = z.infer<typeof presignedUpload>;

// --- write payloads (dashboard builder + identity) ---

export const textFields = z.object({
  name: z.string(),
  nameI18n: localizedText.optional(),
  description: z.string().optional(),
  descriptionI18n: localizedText.optional(),
});
export type TextFields = z.infer<typeof textFields>;

export const menuUpdate = textFields.extend({ active: z.boolean() });
export type MenuUpdate = z.infer<typeof menuUpdate>;

export const categoryUpdate = textFields;
export type CategoryUpdate = z.infer<typeof categoryUpdate>;

export const itemWrite = textFields.extend({
  priceCents: z.number().int(),
  currency: z.string().optional(),
  available: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  variants: z.array(variant).optional(),
});
export type ItemWrite = z.infer<typeof itemWrite>;

export const identityPatch = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  descriptionI18n: localizedText.optional(),
  theme: theme.optional(),
  defaultLanguage: z.string().optional(),
  supportedLanguages: z.array(z.string()).optional(),
});
export type IdentityPatch = z.infer<typeof identityPatch>;

// --- staff provisioning (admin "New restaurant") ---

// A restaurant is always provisioned under a tenant. Staff either pick an
// existing tenant (`tenantId`) or name a brand-new one (`newTenantName`); the
// service provisions the new tenant first (owned by the acting admin). Exactly
// one of the two must be present.
export const staffCreateRestaurant = z
  .object({
    tenantId: z.string().min(1).optional(),
    newTenantName: z.string().trim().min(1).max(120).optional(),
    name: z.string().trim().min(1).max(120),
    defaultLanguage: z.string().trim().min(2).max(10).optional(),
  })
  .refine((d) => Boolean(d.tenantId) !== Boolean(d.newTenantName), {
    message: "provide exactly one of tenantId or newTenantName",
    path: ["tenantId"],
  });
export type StaffCreateRestaurant = z.infer<typeof staffCreateRestaurant>;

// Bounds on a single JSON import — a runaway payload must fail fast (422), not
// stream thousands of rows into one transaction.
export const IMPORT_LIMITS = {
  menus: 20,
  categoriesPerMenu: 60,
  itemsPerCategory: 300,
  totalItems: 2000,
} as const;

export const importItem = z.object({
  name: z.string().trim().min(1).max(160),
  // Per-language overrides of name/description, keyed by language code. Entries
  // for the default language are ignored (the top-level fields are the default).
  nameI18n: localizedText.optional(),
  description: z.string().trim().max(1000).optional(),
  descriptionI18n: localizedText.optional(),
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().trim().length(3).optional(),
  available: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1)).max(20).optional(),
});
export type ImportItem = z.infer<typeof importItem>;

export const importCategory = z.object({
  name: z.string().trim().min(1).max(120),
  items: z.array(importItem).max(IMPORT_LIMITS.itemsPerCategory).optional(),
});
export type ImportCategory = z.infer<typeof importCategory>;

export const importMenu = z.object({
  name: z.string().trim().min(1).max(120),
  categories: z.array(importCategory).max(IMPORT_LIMITS.categoriesPerMenu).optional(),
});
export type ImportMenu = z.infer<typeof importMenu>;

// The JSON document an admin pastes in "Import JSON" mode. `tenant` is the
// optional NEW tenant name — when present the service creates that tenant and
// ignores the request-level tenantId; when absent the request must carry an
// existing tenantId.
export const importPayload = z.object({
  tenant: z.string().trim().min(1).max(120).optional(),
  restaurant: z.object({
    name: z.string().trim().min(1).max(120),
    defaultLanguage: z.string().trim().min(2).max(10).optional(),
    // The languages the menu is offered in. The default is always included even
    // if omitted here. Item translations must use codes from this set.
    supportedLanguages: z.array(z.string().trim().min(2).max(10)).max(20).optional(),
  }),
  menus: z.array(importMenu).min(1).max(IMPORT_LIMITS.menus),
});
export type ImportPayload = z.infer<typeof importPayload>;

export const staffImportRestaurant = z.object({
  // Existing tenant from the picker. Required only when `payload.tenant`
  // (a new tenant name) is absent — the service enforces that rule.
  tenantId: z.string().min(1).optional(),
  payload: importPayload,
});
export type StaffImportRestaurant = z.infer<typeof staffImportRestaurant>;
