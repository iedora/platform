# iedora-app — working rules for Claude

> Architecture, slice pattern, auth, and commands live in **[`AGENTS.md`](./AGENTS.md)** — read it.
> This file adds the **UI-kit knowledge** that AGENTS.md doesn't cover.

---

## The UI kit — shadcn/ui on Base UI

The UI is built on **shadcn/ui** with **Base UI** primitives (shadcn style `base-sera`) and **phosphor** icons, in the **`@iedora/ui`** package. The theme is the shadcn green/neutral palette with light + dark modes.

### Where the UI kit lives
- **`packages/ui/`** — `@iedora/ui`. shadcn primitives at `@iedora/ui/components/ui/*` (Base UI, `@base-ui/react`); thin form wrappers at `@iedora/ui/components/field` (`TextField` / `TextareaField` / `SelectField` / `PasswordField` / `FieldMessage` + low-level `Field`/`FieldLabel`/`FieldError`/…); editorial drop-ins at `@iedora/ui/components/{card,combobox,section-header}`. `Button` has a custom `loading` prop (phosphor `SpinnerIcon`). `cn()` helper at `@iedora/ui/lib/utils`.
- **`apps/web/src/app/globals.css`** — the single theme source: Tailwind v4 `@theme inline` mapping shadcn vars → utilities, `:root` (light) + `.dark` semantic tokens (`--primary` is green `oklch(0.527 0.154 150)`, `--radius` `0.625rem`, sidebar/chart sets), and the `@source` globs that scan each workspace surface. No bespoke CSS.
- **Theme switching** — `next-themes` (`ThemeProvider` in `apps/web/src/app/layout.tsx`, `ThemeToggle` in footers).
- **Fonts** — `--display`/`--serif`/`--sans`/`--mono` set on `<html>` via `next/font` in `layout.tsx`; surfaced as `font-heading`/`font-serif`/`font-sans`/`font-mono`.

### Building UI
- **Compose from `@iedora/ui`** primitives first (`Button`, `Field`, `Card`, `Dialog`, `Tabs`, `Sidebar`…). Don't hand-roll buttons/inputs.
- Layout with Tailwind v4 utilities reading the shadcn tokens (`bg-background`, `bg-card`, `border-border`, `text-primary`, `text-muted-foreground`, `rounded-lg`, `font-heading`). Never hardcode hex.
- Icons: **`@phosphor-icons/react`** (`*Icon` names). In **Server Components import from `@phosphor-icons/react/ssr`** — the main entry uses `createContext` and 500s in RSC.
- Base UI uses the **`render` prop**, not radix `asChild`/`Slot`: `<X render={<Y/>}>children</X>`.
- Match the Pencil design exactly: same text, icon, spacing, radius, color.

---

## Two audiences, opposite UIs (design accordingly)
- **Admin (staff)** — power tools: tables, bulk actions, AI/JSON menu import, density.
- **Restaurant owner (50+, non-technical)** — the opposite: no jargon (never "JSON/import/tenant"), big text + tap targets, plain friendly language, few steps, a real phone number to call. Admin onboards restaurants (incl. menu import); owners only maintain (edit price, mark sold out).

---

## Quick reference
- Stack/auth/slices/commands → **`AGENTS.md`**. App shell rules → **`apps/web/CLAUDE.md`**.
- Data shapes → `packages/contracts/src/*` (zod: `publicMenu` / `publicItem` / `publicCategory`, billing invoices, etc.).
- Run: `bun install` → `bun run api:up` → `bun run dev` (`:3000`). Verify: `bun run typecheck`.
- Tests: co-located Vitest (`renderToStaticMarkup`, assert on `data-test-id`), one slice per file.
