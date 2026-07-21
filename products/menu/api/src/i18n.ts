import type { LocalizedText, PublicMenu } from "@iedora/contracts";

import type { Node } from "./domain.ts";

// Localization. The i18n model stores the
// restaurant's default language in plain columns and non-default overrides in
// *_i18n jsonb maps; readers apply the requested → default → empty fallback.

// Languages is the registry of locales the product can serve.
export const Languages = ["en", "pt", "es", "fr"] as const;

/** True if code is a known locale. */
export function isLanguage(code: string): boolean {
  return (Languages as readonly string[]).includes(code);
}

// pick resolves one field for a language: override → plain (default language)
// → empty. The single fallback rule used by every localized field.
export function pick(plain: string, i18n: LocalizedText | null | undefined, lang: string): string {
  const v = i18n?.[lang];
  return v !== undefined ? v : plain;
}

// pickLanguage negotiates the response language: an explicit ?lang= wins, then
// the Accept-Language header, then the restaurant default. Pure function.
export function pickLanguage(
  param: string,
  acceptHeader: string,
  supported: string[],
  fallback: string,
): string {
  if (supported.includes(param)) return param;
  for (const part of acceptHeader.split(",")) {
    const tag = part.trim().split(";")[0] ?? "";
    const base = tag.split("-")[0] ?? ""; // "pt-BR" → "pt"
    if (supported.includes(base)) return base;
  }
  return fallback;
}

// localize collapses a raw tree to a single language, dropping unavailable
// items (guests never see them).
export function localize(menus: Node[], lang: string): PublicMenu[] {
  return menus.map((m) => ({
    id: m.id,
    name: pick(m.name, m.nameI18n, lang),
    description: pick(m.description, m.descriptionI18n, lang) || undefined,
    categories: m.categories.map((c) => ({
      id: c.id,
      name: pick(c.name, c.nameI18n, lang),
      description: pick(c.description, c.descriptionI18n, lang) || undefined,
      items: c.items
        .filter((it) => it.available)
        .map((it) => ({
          id: it.id,
          name: pick(it.name, it.nameI18n, lang),
          description: pick(it.description, it.descriptionI18n, lang) || undefined,
          priceCents: it.priceCents,
          currency: it.currency,
          imageUrl: it.imageUrl || undefined,
          tags: it.tags,
          variants: it.variants.map((v) => ({
            label: pick(v.label, v.labelI18n, lang),
            priceCents: v.priceCents,
          })),
        })),
    })),
  }));
}
