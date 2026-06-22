import type { LocalizedText } from "@iedora/contracts";

import * as builder from "./data/builder";
import type { MenuDeps } from "./deps";
import type { Restaurant, Variant } from "./domain";

// Sample content seeded for new restaurants so the builder never starts blank.
// At seed time the restaurant's default language is picked into the plain
// column; the rest become i18n overrides. Built on the
// same single-statement store ops as the builder, so seeded content obeys every
// invariant (positions, NULL-variants, i18n).

interface SeedItem {
  name: LocalizedText;
  description: LocalizedText;
  priceCents: number;
  variants?: Variant[];
}
interface SeedCategory {
  name: LocalizedText;
  items: SeedItem[];
}

const sampleMenuName: LocalizedText = { en: "Sample menu", pt: "Menu de exemplo" };

const sampleMenu: SeedCategory[] = [
  {
    name: { en: "Starters", pt: "Entradas" },
    items: [
      {
        name: { en: "Bruschetta", pt: "Bruschetta" },
        description: { en: "Grilled bread, tomato, basil", pt: "Pão grelhado, tomate, manjericão" },
        priceCents: 650,
      },
      {
        name: { en: "Soup of the day", pt: "Sopa do dia" },
        description: { en: "Ask our staff", pt: "Pergunte à equipa" },
        priceCents: 450,
      },
    ],
  },
  {
    name: { en: "Mains", pt: "Pratos principais" },
    items: [
      {
        name: { en: "Steak frites", pt: "Bife com batata frita" },
        description: { en: "Grass-fed beef, hand-cut fries", pt: "Novilho, batata caseira" },
        priceCents: 1900,
        variants: [{ label: "Meia dose", labelI18n: { en: "Half portion" }, priceCents: 1100 }],
      },
      {
        name: { en: "Catch of the day", pt: "Peixe do dia" },
        description: { en: "Market fish, seasonal vegetables", pt: "Peixe do mercado, legumes da época" },
        priceCents: 1700,
      },
    ],
  },
];

// pickDefault chooses the plain-column value for the default language, falling
// back to English (sample data always carries it).
function pickDefault(t: LocalizedText, lang: string): string {
  return t[lang] ?? t.en ?? "";
}

// buildI18n keeps only the overrides a restaurant can serve: supported languages
// minus the default.
function buildI18n(t: LocalizedText, defaultLang: string, supported: string[]): LocalizedText | null {
  const out: LocalizedText = {};
  for (const code of supported) {
    if (code !== defaultLang && t[code] !== undefined) out[code] = t[code]!;
  }
  return Object.keys(out).length === 0 ? null : out;
}

// seedSample creates the sample menu in the restaurant's language config.
export async function seedSample(deps: MenuDeps, r: Restaurant): Promise<string> {
  const def = r.defaultLanguage;
  const langs = r.supportedLanguages;
  const db = deps.db.db;

  const menuId = await builder.createMenu(db, r.id, pickDefault(sampleMenuName, def));
  const menuI18n = buildI18n(sampleMenuName, def, langs);
  if (menuI18n) {
    await builder.updateMenu(db, menuId, r.id, pickDefault(sampleMenuName, def), "", menuI18n, null, true);
  }
  for (const cat of sampleMenu) {
    const catId = await builder.createCategory(db, menuId, r.id, pickDefault(cat.name, def));
    const catI18n = buildI18n(cat.name, def, langs);
    if (catI18n) {
      await builder.updateCategory(db, catId, r.id, pickDefault(cat.name, def), "", catI18n, null);
    }
    for (const it of cat.items) {
      await builder.createItem(db, catId, r.id, {
        name: pickDefault(it.name, def),
        nameI18n: buildI18n(it.name, def, langs),
        description: pickDefault(it.description, def),
        descriptionI18n: buildI18n(it.description, def, langs),
        priceCents: it.priceCents,
        currency: "EUR",
        available: true,
        tags: [],
        variants: it.variants ?? null,
      });
    }
  }
  return menuId;
}
