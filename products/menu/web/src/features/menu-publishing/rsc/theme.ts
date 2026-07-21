import { TEMPLATE_META } from './templates'

/**
 * Operator-authored theme blob as stored by the menu service
 * (`restaurant.theme` JSONB — mirrored here so this module stays free
 * of any DB import). Forward-compatible: unknown keys pass through.
 */
export type RestaurantTheme = {
  primaryColor?: string
  secondaryColor?: string
  font?: 'inter' | 'playfair' | 'lora' | 'space-grotesk'
  layout?: 'classic' | 'minimal' | 'editorial' | 'cards'
  [key: string]: unknown
}

// LAYOUTS is derived from the templates registry — single source of truth
// for which templates exist lives in ./templates/index.ts.
export const LAYOUTS = TEMPLATE_META

export const FONTS = [
  { id: 'inter', name: 'Inter', cssVar: '--font-inter' },
  { id: 'playfair', name: 'Playfair Display', cssVar: '--font-playfair' },
  { id: 'lora', name: 'Lora', cssVar: '--font-lora' },
  { id: 'space-grotesk', name: 'Space Grotesk', cssVar: '--font-space-grotesk' },
] as const satisfies ReadonlyArray<{
  id: NonNullable<RestaurantTheme['font']>
  name: string
  cssVar: string
}>

export type ResolvedTheme = Required<
  Pick<RestaurantTheme, 'primaryColor' | 'secondaryColor' | 'font' | 'layout'>
>

export const DEFAULT_THEME: ResolvedTheme = {
  layout: 'classic',
  font: 'inter',
  primaryColor: '#111111',
  secondaryColor: '#6b7280',
}

/**
 * Curated "looks" the owner picks from instead of wiring layout + font +
 * colours by hand. A preset is just a bundle of the four persisted theme
 * fields, so picking one writes the same `ResolvedTheme` shape the public
 * renderer already consumes — no new storage. The brand colour the owner
 * sets afterwards overrides `primaryColor` on top of the chosen preset.
 */
export type StylePreset = {
  id: string
  /** i18n key suffix under `Settings.Theme.presets.*`. */
  key: string
} & ResolvedTheme

// Each preset owns a UNIQUE (layout, font) pair — that pair is the identity
// `matchPreset` keys on, so two presets must never collide on it (the brand
// colour is deliberately NOT part of the match, so a colour tweak keeps the
// preset selected).
export const STYLE_PRESETS: readonly StylePreset[] = [
  { id: 'classic', key: 'classic', layout: 'classic', font: 'lora', primaryColor: '#111111', secondaryColor: '#6b7280' },
  { id: 'modern', key: 'modern', layout: 'minimal', font: 'space-grotesk', primaryColor: '#1a1a1a', secondaryColor: '#8a8a8a' },
  { id: 'warm', key: 'warm', layout: 'cards', font: 'inter', primaryColor: '#b45309', secondaryColor: '#92766a' },
  { id: 'bold', key: 'bold', layout: 'classic', font: 'space-grotesk', primaryColor: '#b91c1c', secondaryColor: '#6b7280' },
  { id: 'fresh', key: 'fresh', layout: 'minimal', font: 'inter', primaryColor: '#2e7d32', secondaryColor: '#6b8a72' },
  { id: 'editorial', key: 'editorial', layout: 'editorial', font: 'playfair', primaryColor: '#1f2937', secondaryColor: '#6b7280' },
] as const

/** The preset whose layout + font match a theme (brand colour is independent). */
export function matchPreset(theme: ResolvedTheme): StylePreset | undefined {
  return STYLE_PRESETS.find((p) => p.layout === theme.layout && p.font === theme.font)
}

/** A small palette of brand-colour quick-picks for the colour control. */
export const BRAND_SWATCHES = [
  '#111111', '#b91c1c', '#b45309', '#2e7d32', '#0369a1', '#6d28d9', '#be185d',
] as const

// Coerce the stored blob (possibly null/partial/legacy — or the untyped
// `Record<string, unknown>` the public payload carries) into a fully
// populated theme. Unknown layout/font values fall back to defaults rather
// than throw, so old rows or hand-edited JSON never crash the public page.
export function resolveTheme(
  theme: RestaurantTheme | Record<string, unknown> | null | undefined,
): ResolvedTheme {
  const t = (theme ?? {}) as RestaurantTheme
  const layoutIds = LAYOUTS.map((l) => l.id) as ReadonlyArray<string>
  const fontIds = FONTS.map((f) => f.id) as ReadonlyArray<string>
  return {
    layout:
      t.layout && layoutIds.includes(t.layout) ? t.layout : DEFAULT_THEME.layout,
    font: t.font && fontIds.includes(t.font) ? t.font : DEFAULT_THEME.font,
    primaryColor: isHex(t.primaryColor) ? t.primaryColor! : DEFAULT_THEME.primaryColor,
    secondaryColor: isHex(t.secondaryColor)
      ? t.secondaryColor!
      : DEFAULT_THEME.secondaryColor,
  }
}

export const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/

function isHex(v: string | undefined): boolean {
  return typeof v === 'string' && HEX_PATTERN.test(v)
}

export function fontCssVar(font: ResolvedTheme['font']): string {
  return FONTS.find((f) => f.id === font)!.cssVar
}
