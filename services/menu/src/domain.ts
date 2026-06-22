import type { LocalizedText, Theme } from "@iedora/contracts";

// The menu content model as read from the DB (i18n maps intact). The public
// read path runs Node trees through localize(); the admin builder (Stage B)
// consumes them raw.

export type { LocalizedText, Theme };

// Variant is one alternative price of an item ("Meia dose", "Jarra 0.5L").
export interface Variant {
  label: string;
  labelI18n?: LocalizedText;
  priceCents: number;
}

// Restaurant is the tenant-scoped root of the content hierarchy.
export interface Restaurant {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  descriptionI18n: LocalizedText | null;
  logoUrl: string;
  bannerUrl: string;
  theme: Theme | null;
  defaultLanguage: string;
  supportedLanguages: string[];
  onboardingCompletedAt: Date | null;
  updatedAt: Date;
}

// Tree types: the full hierarchy with i18n maps, as stored.
export interface ItemNode {
  id: string;
  categoryId: string;
  name: string;
  nameI18n: LocalizedText | null;
  description: string;
  descriptionI18n: LocalizedText | null;
  priceCents: number;
  currency: string;
  imageUrl: string;
  position: number;
  available: boolean;
  tags: string[];
  variants: Variant[];
}

export interface CategoryNode {
  id: string;
  menuId: string;
  name: string;
  nameI18n: LocalizedText | null;
  description: string;
  descriptionI18n: LocalizedText | null;
  position: number;
  items: ItemNode[];
}

export interface Node {
  id: string;
  name: string;
  nameI18n: LocalizedText | null;
  description: string;
  descriptionI18n: LocalizedText | null;
  position: number;
  active: boolean;
  categories: CategoryNode[];
}

// Snapshot is the public read model for one restaurant: identity + the active
// menu tree, still carrying i18n maps (localize collapses it per request).
export interface Snapshot {
  restaurant: Restaurant;
  menus: Node[];
}
