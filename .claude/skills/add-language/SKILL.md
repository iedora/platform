---
name: add-language
description: Use when adding a new language to the i18n module (e.g. de, it, ja). Encodes the registry pattern — a new language is a self-contained folder under lib/i18n/languages/, registered once. The renderer, dashboard settings, language picker on the public menu, and Zod validation pick it up automatically.
---

# add-language

The i18n module mirrors the templates module: per-language folders, a registry, a barrel. Adding a language must NOT touch the renderer, the public switcher, or the action validation.

## Steps

1. **Create the language module** at `lib/i18n/languages/<code>/` with two files:
   - `meta.ts` — `export const meta: LanguageMeta = { code: '<code>', name: '<English name>', nativeName: '<native>', dir: 'ltr' | 'rtl' }`.
   - `index.ts` — `import { meta } from './meta'; export const language: Language = meta`.

2. **Extend the union literal** in `lib/i18n/types.ts`:
   ```ts
   export type LanguageCode = 'en' | 'pt' | 'es' | 'fr' | '<code>'
   ```
   This is a TypeScript-only change; jsonb columns hold whatever shape we send.

3. **Register it** in `lib/i18n/registry.ts`:
   ```ts
   import { language as <code> } from './languages/<code>'
   const REGISTRY: Record<LanguageCode, Language> = { en, pt, es, fr, <code> }
   ```

4. **Run** `bun run typecheck`. The compiler enforces that `REGISTRY` covers every `LanguageCode` literal — a missing entry is a build error.

5. **No migration needed.** `restaurant.supportedLanguages` is a jsonb array — it accepts any string. Existing rows that don't reference the new code remain untouched.

## What you should NOT need to touch

- `lib/i18n/format.ts` — `pickLanguage`/`localized` handle any code present in `supported`.
- `app/r/[slug]/page.tsx` — switcher iterates supportedLanguages, picks meta from the registry.
- `app/dashboard/r/[slug]/theme/theme-editor.tsx` — Languages section iterates `LANGUAGE_META`.
- `components/i18n/localized-fields.tsx` — generic, language-agnostic.
- Server action Zod schemas — they validate keys against `LANGUAGE_CODES`, which is derived from the registry.

If you find yourself editing any of these, you're working against the registry. Stop and put the new language behavior inside the language module instead (or extend `LanguageMeta` with a new field if it's structural).

## RTL languages (e.g. Arabic, Hebrew)

Set `dir: 'rtl'` in the `meta.ts`. The public page wrapper reads `getLanguage(currentLanguage)?.dir` and applies it as the `dir` attribute on the menu root, so layout flips at the browser level. The dashboard stays LTR because the root layout's `<html lang="en">` is unchanged. If a template hardcodes left/right margins or text alignment, that's a template bug — fix the template, not the language.

## Translating built-in copy

The current scope is *menu content* (item names, descriptions, etc.) — admin UI strings stay in English. If a future task adds dashboard i18n via `next-intl`, that lives outside this module and follows its own catalog conventions.
