import type { LocalizedText, Theme } from "@iedora/contracts";

import type { Variant } from "./domain.ts";
import { invalid } from "./errors.ts";
import { isLanguage } from "./i18n.ts";

// Validation limits — the single source of truth for field constraints. The
// limits match the values existing content was created under, so it stays valid.
const MAX_SHORT_NAME = 80; // menu + category names
const MAX_ITEM_NAME = 120; // item names + variant labels
const MAX_DESCRIPTION = 1000; // all descriptions + i18n values
const MAX_PRICE_CENTS = 100_000_00; // €1,000.00
const MAX_VARIANTS = 20;
const MAX_TAGS = 20;

export { MAX_SHORT_NAME, MAX_ITEM_NAME };

/** Validates a required text field and returns its trimmed value (422 if empty/long). */
export function trimmed(field: string, v: string, limit: number): string {
  const t = (v ?? "").trim();
  if (t === "") throw invalid(`${field} is required`);
  if (t.length > limit) throw invalid(`${field} must be at most ${limit} characters`);
  return t;
}

/** Validates an optional text field; empty stays empty (stored NULL). */
export function optional(field: string, v: string, limit: number): string {
  const t = (v ?? "").trim();
  if (t.length > limit) throw invalid(`${field} must be at most ${limit} characters`);
  return t;
}

// Menus often print a trailing period on dish names ("Bacalhau à Brás."); drop
// it so titles read cleanly. A numeric prefix keeps its dot ("1. Pizza") — only
// the very end is trimmed, and never down to an empty string.
export function stripTrailingDots(s: string): string {
  const out = s.replace(/[.\s]+$/, "");
  return out.length > 0 ? out : s;
}

export function validPrice(field: string, cents: number): void {
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_PRICE_CENTS) {
    throw invalid(`${field} must be between 0 and ${MAX_PRICE_CENTS} cents`);
  }
}

// prune drops empty values and unknown locales, returning null when nothing
// remains (empty maps stored as NULL).
function prune(t: LocalizedText): LocalizedText | null {
  const out: LocalizedText = {};
  for (const [code, raw] of Object.entries(t)) {
    const v = (raw ?? "").trim();
    if (v !== "" && isLanguage(code)) out[code] = v;
  }
  return Object.keys(out).length === 0 ? null : out;
}

// validI18n bounds every override value and returns the pruned map with the
// default-language key removed — that value lives in the plain column, so an
// override for it would shadow it. The i18n invariant (overrides only) is
// enforced here, at the write boundary.
export function validI18n(
  field: string,
  t: LocalizedText | null | undefined,
  defaultLang: string,
): LocalizedText | null {
  if (!t) return null;
  for (const [code, v] of Object.entries(t)) {
    if ((v ?? "").length > MAX_DESCRIPTION) throw invalid(`${field} translation "${code}" is too long`);
  }
  const pruned = prune(t);
  if (!pruned) return null;
  delete pruned[defaultLang];
  return Object.keys(pruned).length === 0 ? null : pruned;
}

// validVariants normalizes a variant list: null stays null (single price),
// non-null is validated and pruned. Callers distinguish "absent" (leave alone)
// from "empty" (clear) before calling.
export function validVariants(
  variants: Variant[] | null | undefined,
  defaultLang: string,
): Variant[] | null {
  if (!variants) return null;
  if (variants.length > MAX_VARIANTS) throw invalid(`at most ${MAX_VARIANTS} variants`);
  const out: Variant[] = [];
  variants.forEach((v, i) => {
    const label = trimmed(`variant ${i + 1} label`, v.label, MAX_ITEM_NAME);
    validPrice(`variant ${i + 1} price`, v.priceCents);
    const labelI18n = validI18n("variant label", v.labelI18n, defaultLang);
    out.push({ label, ...(labelI18n ? { labelI18n } : {}), priceCents: v.priceCents });
  });
  return out.length === 0 ? null : out;
}

const THEME_FONTS = new Set(["inter", "playfair", "lora", "space-grotesk"]);
const THEME_LAYOUTS = new Set(["classic", "minimal", "editorial", "cards"]);

// validTheme allow-lists known keys; unknown keys pass through (forward compatible).
export function validTheme(t: Theme): void {
  const font = t.font;
  if (typeof font === "string" && !THEME_FONTS.has(font)) throw invalid("unknown theme font");
  const layout = t.layout;
  if (typeof layout === "string" && !THEME_LAYOUTS.has(layout)) throw invalid("unknown theme layout");
  for (const key of ["primaryColor", "secondaryColor"]) {
    const c = t[key];
    if (typeof c === "string" && c.length > 32) throw invalid(`${key} is too long`);
  }
}

// validLanguages checks a language configuration: every code known, the default
// included in the supported set.
export function validLanguages(def: string, supported: string[]): void {
  if (!isLanguage(def)) throw invalid("unknown default language");
  let found = false;
  for (const code of supported) {
    if (!isLanguage(code)) throw invalid(`unknown supported language ${code}`);
    found = found || code === def;
  }
  if (!found) throw invalid("default language must be in supported languages");
}

export { MAX_DESCRIPTION, MAX_TAGS };
