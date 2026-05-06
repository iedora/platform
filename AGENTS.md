<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Meta Menu — project conventions

## What this is
SaaS multi-tenant restaurant menu builder. Each tenant is a Better Auth `organization` that owns one or more `restaurant` rows. Admins build menus via drag-and-drop; the public menu renders from the same data.

## Stack
- **Next.js 16** (App Router, Turbopack default, Cache Components)
- **TypeScript** strict
- **Drizzle ORM** + `postgres-js` driver, **Postgres 18**
- **Better Auth** with `organization` plugin
- **shadcn/ui** + Tailwind v4
- **@dnd-kit** for drag-and-drop
- **Bun** as package manager and test runner; **Node** as production runtime (Bun + `next build` is unstable as of 2026 — see oven-sh/bun#23944)

## Hard rules

1. **Tenant scoping is mandatory.** Every query touching `restaurant`, `menu`, `category`, or `item` MUST filter by `restaurantId` AND verify the caller is a `member` of the parent `organization`. Never trust IDs from the client without rechecking ownership. Centralize this in `lib/dal.ts` — use `requireRestaurantAccess(restaurantId)` before any tenant query.

2. **Schema is the source of truth.** `lib/db/schema.ts` is the single canonical schema. Migrations are generated, not handwritten — run `bun run db:generate` then `bun run db:migrate`.

3. **Auth checks belong in the data layer, not in layouts.** Layouts in Next 16 don't re-render on navigation, so an auth check in a layout WILL leak. Use `verifySession()` / `requireRestaurantAccess()` from `lib/dal.ts` close to the data fetch or in the page component itself.

4. **Use shadcn via MCP** when possible. `bunx shadcn@latest add <component>` works too. Don't hand-write primitives that already exist in shadcn.

5. **No `middleware.ts`.** Next 16 renamed it to **`proxy.ts`**. The proxy is for *optimistic* redirects only (cookie presence checks). Real auth always lives in the DAL.

6. **Money is integer cents** in `priceCents`, currency in a separate column. Never use floats for prices.

7. **Drag-and-drop reordering** uses integer `position` columns (per parent). On reorder, recompute positions for affected rows in a single transaction. Renumber periodically if gaps grow.

8. **Menu templates are open/closed.** Each template lives in its own folder under `components/menu/templates/<id>/` and exports a `template: MenuTemplate` from `index.ts`. The renderer (`menu-renderer.tsx`) consumes only the registry — never edit it to support a new template. Adding a template = new folder + 1 import + 1 entry in `templates/registry.ts` + the literal in `RestaurantTheme.layout` (schema). LAYOUTS in `lib/menu-themes.ts` is derived from the registry; do not maintain it separately.

9. **Asset keys are tenant-prefixed and verified twice.** Every uploaded object's S3 key starts with `r/{restaurantId}/`. The `requireRestaurantAccess` DAL guard runs first; `assertKeyBelongsToTarget` then rejects any commit whose key doesn't match the target's restaurant — defense-in-depth against a stale presign being redirected. New asset targets must follow the same `r/{restaurantId}/...` scheme in `lib/storage/targets.ts` and gate item-scoped uploads with an extra ownership check (see `assertItemBelongsToRestaurant`).

10. **Languages live in a registry.** Each supported language is a self-contained module under `lib/i18n/languages/<code>/` exporting `language: Language` from its `index.ts`. `lib/i18n/registry.ts` is the only place that knows the full set; `LANGUAGE_CODES`, `LANGUAGE_META`, and `getLanguage` are derived. The Zod schemas in actions use `z.record(z.string(), …).refine(keys ⊂ LANGUAGE_CODES)` because Zod 4 makes `z.record(z.enum([...]), …)` exhaustive. Translatable text uses the pattern: plain `name`/`description` text columns are the source of truth for the restaurant's `defaultLanguage`; sibling jsonb `*I18n` columns carry overrides for non-default languages. Fallback chain at render time: requested → default → empty. New languages: see `/add-language` skill.

## File layout
```
app/
  (auth)/             # public auth pages (signup, login)
  dashboard/          # admin pages — protected
    r/[slug]/         # restaurant home
      m/[menuId]/     # dnd-kit menu builder
      theme/          # settings: identity (name, desc, logo, banner) + theme (layout, font, colors)
      qr/             # QR code generator with print/download
  r/[slug]/           # public menu page per restaurant
  onboarding/         # first-run org + restaurant
  api/auth/[...all]/  # Better Auth handler
lib/
  auth.ts             # Better Auth server config
  auth-client.ts      # Better Auth React client
  dal.ts              # verifySession + tenant-scoped guards
  utils.ts            # shadcn cn() helper
  menu-themes.ts      # ResolvedTheme defaults, FONTS, HEX_PATTERN; LAYOUTS derived from templates registry
  i18n/
    types.ts          # LanguageCode, Language, LocalizedText
    languages/<code>/ # per-language meta + index barrel (en, pt, es, fr)
    registry.ts       # REGISTRY + LANGUAGE_META + LANGUAGE_CODES + getLanguage
    format.ts         # localized() / pickLanguage() — fallback chain helpers
    index.ts          # public barrel
  db/
    index.ts          # drizzle client
    schema.ts         # all tables — single source of truth
  storage/            # S3-compatible storage adapter (MinIO/R2/S3)
    types.ts          # Storage interface, AssetTarget union
    targets.ts        # constraints + tenant-prefixed key builder
    s3-storage.ts     # AWS SDK v3 implementation
    bootstrap.ts      # idempotent ensureBucket + public-read policy
    index.ts          # getStorage() singleton wired from env
  upload/
    actions.ts        # presign + commit + clear actions, DAL-guarded
components/
  ui/                 # shadcn primitives
  upload/
    image-upload.tsx  # generic <ImageUpload target=...> reusable across all asset kinds
  i18n/
    localized-fields.tsx  # shared tabbed name+description editor used by item/category/identity dialogs
  menu/
    menu-renderer.tsx # consumes template registry; injects theme as CSS vars
    types.ts          # PublicMenuData / RenderProps shared by all templates
    format.ts         # price/i18n helpers used by templates
    templates/
      classic/        # template module: classic-menu.tsx + meta.ts + index.ts
      minimal/        # template module
      types.ts        # MenuTemplate, TemplateMeta, TemplateId
      registry.ts     # REGISTRY + getTemplate + TEMPLATE_META
      index.ts        # public barrel (only surface other code should import)
proxy.ts              # Next 16 proxy (was middleware)
drizzle.config.ts
docker-compose.yml    # postgres + redis + minio
.mcp.json             # shadcn, postgres, bun, next-devtools, playwright MCP servers
tests/e2e/
  specs/              # organized by module: auth, tenancy, menu-builder, public-menu, settings, qr, uploads
  helpers/            # shared signup/org/db utilities
```

## Useful commands
- `bun run dev` — Next.js dev server (Turbopack)
- `bun run typecheck` — TS check without emit
- `bun run db:generate` — generate Drizzle migration from schema changes
- `bun run db:migrate` — apply pending migrations
- `bun run db:push` — push schema directly (dev only, no migration files)
- `bun run db:studio` — open Drizzle Studio
- `bun run auth:generate` — sync Better Auth tables into the schema (re-run after changing auth plugins)
- `docker compose up -d` — start Postgres + Redis + MinIO
- `bunx shadcn@latest add <name>` — add a shadcn component

## Where to look when unsure
1. `node_modules/next/dist/docs/` — bundled, version-matched Next.js docs
2. `node_modules/better-auth/` and the Better Auth README in node_modules — auth APIs
3. `node_modules/drizzle-orm/` — query builder, types

The bundled docs match installed versions — trust them over recall.
