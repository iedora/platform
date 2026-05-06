# Meta Menu

A self-hosted multi-tenant SaaS for restaurants to build digital menus by drag and drop. Each restaurant gets a public menu page at `/r/<slug>`; the admin builds it from the dashboard with reorderable categories and items.

## Features

- Email + password authentication via Better Auth, with multi-tenant organizations.
- Drag-and-drop menu builder (categories and items, mouse + keyboard).
- Item dialog for name, description, price, availability, photo.
- **Image uploads** (logo, banner, item photos) via presigned PUT to S3-compatible storage (MinIO local, swap for R2/S3 in prod).
- **Theme editor** with live preview: pick a template (classic, minimal), Google fonts, primary/secondary colors. Values persist in `restaurant.theme` and apply to `/r/<slug>` via CSS variables.
- **Identity editor** for name, description, logo, banner — all changes feed the same live preview.
- **QR code page** per restaurant: SVG/PNG download + print-friendly layout pointing at `/r/<slug>`.
- **Multi-language menus** — restaurant admin picks default + supported languages; items, categories, menus, and the restaurant description carry per-language overrides. Public page negotiates language via `?lang=` or `Accept-Language` and falls back to default for missing translations. Languages are a registry pattern (`lib/i18n/`), so adding a new one is a single folder + one entry.
- **Sample menu seed** — one click creates a realistic bistro menu (3 categories, 8 items) so the dashboard isn't empty during onboarding/demos.
- Publish toggle: drafts return 404 on the public URL, published menus render server-side with metadata for sharing.
- Tenant isolation enforced in the data access layer — every query filters by `restaurantId` after a membership check; storage keys are tenant-prefixed (`r/{restaurantId}/...`) and verified at commit time.
- Templates follow an open/closed registry pattern — adding a new layout is a new folder under `components/menu/templates/<id>/` plus one entry in `registry.ts`.
- End-to-end Playwright suite (32 specs across 7 modules) covers signup, onboarding, redirects, tenancy, builder CRUD + sample seed, publish, theme + identity editing, QR generation, and image uploads (logo + item photos, replace, remove, oversize).

## Tech stack

- **Next.js 16** (App Router, Turbopack, Cache Components) — `proxy.ts` replaces the old `middleware.ts`.
- **TypeScript** strict, **Tailwind v4**, **shadcn/ui** (Base UI under the hood).
- **Drizzle ORM** with the `postgres-js` driver, **PostgreSQL 18**.
- **Better Auth** with the `organization` plugin.
- **dnd-kit** for drag-and-drop.
- **Bun** as package manager + test runner; **Node** as the production runtime (`next start`).
- **Playwright** for E2E tests.
- Self-hostable: Docker Compose for local services (Postgres, Redis, MinIO).

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Docker](https://www.docker.com/) (or [OrbStack](https://orbstack.dev/)) running locally
- Node.js (used by Playwright; comes with most setups)

## Getting started

```bash
# 1. Install dependencies
bun install

# 2. Bring up Postgres, Redis and MinIO
docker compose up -d

# 3. Configure environment
cp .env.example .env.local
# generate a real secret and paste it into BETTER_AUTH_SECRET in .env.local
openssl rand -base64 32

# 4. Run migrations
bun run db:migrate

# 5. Start the dev server
bun run dev
```

Open <http://localhost:3000>, sign up, and you'll be taken through onboarding. Your first restaurant gets a default "Main menu" you can fill in immediately.

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Next.js dev server with Turbopack |
| `bun run build` | Production build |
| `bun run start` | Run the production build |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint |
| `bun run db:generate` | Generate a Drizzle migration from `lib/db/schema.ts` |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:push` | Push schema directly (dev convenience, no migration file) |
| `bun run db:studio` | Drizzle Studio |
| `bun run auth:generate` | Re-sync Better Auth tables into the schema |
| `bun run test:e2e` | Playwright suite (production build + start) |
| `bun run test:e2e:ui` | Playwright UI mode |

## Project layout

```
app/
  (auth)/             public auth pages (signup, login)
  dashboard/          authenticated admin
    r/[slug]/         restaurant home (publish toggle, sample seed, nav)
      m/[menuId]/     dnd-kit menu builder
      theme/          settings: identity + theme editor with live preview
      qr/             QR code: SVG/PNG download + print-friendly layout
  r/[slug]/           public menu page (consumes templates registry)
  onboarding/         first-run org + restaurant creation
lib/
  auth.ts             Better Auth server config
  auth-client.ts      Better Auth React client
  dal.ts              Data access layer (verifySession, requireRestaurantAccess, …)
  menu-themes.ts      Theme defaults + fonts; LAYOUTS derived from templates registry
  i18n/               Per-language registry (en/pt/es/fr) + format helpers
  db/
    index.ts          Drizzle client (postgres-js)
    schema.ts         single source of truth — auth + domain tables
  storage/            S3-compatible adapter (Storage interface + AWS SDK v3 impl)
  upload/             presign / commit / clear actions, DAL-guarded
components/
  ui/                 shadcn primitives
  upload/             generic <ImageUpload target=...> client component
  menu/               renderer + shared types + per-template modules under templates/
proxy.ts              Next 16 proxy (was middleware.ts)
tests/e2e/specs/      Playwright specs organized by module (auth, tenancy, menu-builder, …)
drizzle/              Generated migration files
docker-compose.yml    Postgres + Redis + MinIO
```

## Architecture notes

- **Tenant scoping is mandatory.** Every query touching `restaurant`, `menu`, `category`, or `item` filters by `restaurantId` and verifies the caller is a `member` of the parent `organization`. Centralized in `lib/dal.ts`.
- **Schema is the source of truth.** `lib/db/schema.ts` is canonical; migrations are generated, not handwritten.
- **Auth checks live in the data layer, not in layouts.** Next 16 layouts don't re-render on navigation, so layout-only auth checks are unsafe.
- **Drag-and-drop reordering** uses integer `position` columns per parent. On reorder the affected rows are renumbered in a single transaction.
- **Money is integer cents**; currency lives in a separate column.

See `AGENTS.md` for the full conventions document used by AI coding assistants — it doubles as a contributor guide.

## License

Not yet declared.
