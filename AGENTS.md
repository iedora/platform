<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# iedora web — project conventions

> Bun-workspaces monorepo (the `iedora/platform` repo, formerly `menu`). The
> Next.js app (`apps/web/`) is UI-ONLY — it serves every product as a
> host-routed **surface** through `src/proxy.ts` + `src/generated/surfaces.ts`:
> `menu.iedora.com` (menu app, incl. sign-in/up/out), `iedora.com` (house
> landing), and `tutor.iedora.com` (tutoring marketplace). ALL data, auth and
> business rules live in the backends — menu at `products/menu/api`, tutor at
> `products/tutor/api`, plus the shared services under `services/`. The frontend
> talks to them over HTTP, server-side only.

## What this is

- **Menu** (menu.iedora.com — `apps/web/`) — SaaS multi-tenant restaurant menu builder, including the auth pages (`/sign-in|/sign-up|/sign-out` over the auth service). UI in `products/menu/`.
- **House** (iedora.com — `apps/web/src/app/house/`) — brand landing page.
- **Tutor** (tutor.iedora.com — `apps/web/src/app/tutor/`) — tutoring marketplace surface; UI in `products/tutor/web`, a UI-only BFF over the `tutor-api` backend (`products/tutor/api`). Its own auth tenant (`tutor`, cookie `tutor_access`). Includes the `/tutor/vantage` platform-admin console.
- **Admin** (admin.iedora.com) — staff console; lives inside the Next.js app (`apps/web/src/app/menu/dashboard/admin/`), gated by the staff role.

**Identity is the auth service** (`services/auth`): email+password,
EdDSA access JWTs (15 min) + rotating refresh cookie, tenants/memberships.
The Next side is BFF-lite (`@iedora/api-client`): auth server actions
(`products/menu/web/src/features/auth/actions.ts`) mirror
the access token into the HttpOnly `iedora_access` cookie, `src/proxy.ts`
refreshes it for protected routes, and `serverFetch` attaches the Bearer on
every API call. The browser NEVER calls the services directly.

## Stack

- **Backend services** (`services/`) — Bun + Hono, Kysely on Bun's native `SQL`, jose for EdDSA JWTs. Postgres 18, one database per service, migrations owned by each service. See [`services/AGENTS.md`](./services/AGENTS.md).
- **Next.js 16** (App Router, Turbopack default) — UI only: RSC reads via `serverFetch`, mutations via server actions.
- **TypeScript** strict, every workspace.
- **`@iedora/ui`** + Tailwind v4 — shadcn/ui on Base UI primitives (style `base-sera`), phosphor icons. Components at `@iedora/ui/components/ui/*` plus editorial drop-ins (`card`, `combobox`, `field`, `section-header`).
- **@dnd-kit** — menu's drag-and-drop builder.
- **Bun** — package manager, test runner, dev orchestrator. **Production runtime is Node** — `bun + next build` is unstable as of 2026 (oven-sh/bun#23944).
- **Deploy** — owned by the `iedora-infra` repo (Kamal 2 + OpenTofu, one Proxmox VM). This repo ships images: root `Dockerfile` (the `iedora-web` UI, all surfaces — Kamal builds from the repo root) and `services/Dockerfile` (the `iedora-api` backend services).

## File layout

```
iedora/
  bun.lock
  package.json                           workspaces: products/*/* + services/* + packages/framework/* + packages/sdk/* + packages/* + apps/*
  compose.yaml                           FULL local backend: services + Postgres
  Dockerfile                             Multi-stage Node build for apps/web (iedora/web image; Kamal builds from root)

  products/                              Per-product cohesion — a product's web + backend (+ db/contracts) live together
    menu/
      web/                               @iedora/product-menu — menu UI slices (incl. auth) + typed API client
      api/                               @iedora/service-menu — menu backend (Bun + Hono): public menu, staff, plans, uploads
    tutor/
      web/                               @iedora/product-tutor — tutor UI slices + BFF wrappers + vantage
      api/                               @iedora/service-tutor — tutor backend (Bun + Hono, internal): bookings, lessons,
                                         admin; self-contained DB (src/db + migrations/) + contracts (src/contracts, via #db / #contracts)

  services/                              Standalone shared backends (Bun + Hono) — SSO-style microservices
    auth/                                @iedora/service-auth — multi-tenant OIDC/JWKS; the shared `iedora` realm (SSO)
    audit/ billing/ email/               @iedora/service-{audit,billing,email} — internal, over container DNS
    Dockerfile                           ONE iedora/api image (--filter @iedora/service-*); entrypoint migrates-then-serves

  packages/                              Shared libraries
    framework/                           Pure runtime for every backend — @iedora/{config,db,messaging,observability,server-kit,service-kit}
    sdk/auth/                            @iedora/auth-sdk — auth realm client + centralized Next SSO integration (./next)
    sdk/clients/                         @iedora/sdk — service clients (/audit /billing /email)
    api-client/                          @iedora/api-client — BFF fetch: ApiError + authedFetch
    brand/                               @iedora/brand — brand strings, product registry, URL validators
    contracts/                           @iedora/contracts — shared zod data shapes
    ui/                                  @iedora/ui — shadcn/ui on Base UI primitives + phosphor
    observability/                       @iedora/menu-observability — menu OTel tenant context (restaurant/tenant)
    service-runtime/                     @iedora/service-runtime — shared backend server runtime
    eslint-config/                       @iedora/eslint-config — shared ESLint config

  apps/web/                              Next.js — serves all surfaces (house/menu/tutor), UI only
    src/
      app/                               Routes: menu incl. (auth), house, tutor/*, up
      generated/surfaces.ts              host-to-surface topology (hand-maintained)
      surface-auth.ts                    per-surface protected paths (ONE shared authConfig)
      proxy.ts                           Host rewrite + per-surface auth gate + token refresh
```

## apps/web — the Next.js shell

### Hard rules

1. **Routes live here, slices live in products/.** `apps/web/src/app/` contains every `page.tsx`, `route.ts`, `layout.tsx`, `not-found.tsx`. Files import from workspace packages by package name — `import { ... } from '@iedora/product-menu/features/auth'`. Adding business logic INSIDE a route file is the bug.

2. **`src/proxy.ts` owns host dispatch + the auth gate.** It is the ONE place that refreshes an expired access token for page loads, so RSCs always read a valid `iedora_access` cookie. Authorization proper stays with the services.

3. **`src/app/layout.tsx` + `globals.css` are the only shared chrome.** Per-surface layouts (e.g. the (auth) sign-in shell, dashboard chrome) live at the appropriate sub-route's `layout.tsx`.

4. **No tsconfig path aliasing.** `apps/web/tsconfig.json` has no `paths` entries. Every cross-package import goes through the declared package name.

5. **One image, two hosts.** The Docker image serves `menu.iedora.com` and `iedora.com` from the same node process. Adding a new host = new entry in `generated/surfaces.ts` + new sub-route under `src/app/<host>/` + new workspace dep in `package.json` + new entry in `next.config.ts::transpilePackages` + new project reference in `tsconfig.json::references`.

## Vertical slice pattern — the contract

Every Next.js product follows this. Code is organised as **vertical slices**: each business capability lives in `src/features/<slice>/` and owns its UI + the thin server glue that talks to the backend. There is NO data layer on the TypeScript side — no ports/adapters/use-cases, no ORM, no DB fixtures. The services own validation, tenancy and persistence; a slice's server code is a thin typed pass-through.

### Slice file layout

```
src/features/<slice>/
├── index.ts                      public API: cached read loaders + types
├── actions.ts                    'use server' shells: typed API call → revalidate
├── ui/                           slice-owned React components (optional)
└── <pure-helper>.ts(.test.ts)    pure domain helpers + their Vitest suites
```

The typed API client lives at **`src/shared/api.ts`** — one function per endpoint, DTO types mirroring the service contracts. It is the ONLY module that builds menu-service URLs. It sits on `@iedora/api-client`'s `serverFetch`, which attaches the Bearer token from the `iedora_access` cookie and refreshes once on 401.

Reference slices: `features/menu-builder` (read loader + a dozen thin actions), `features/auth` (session guards only — no data), `features/plans` (loader + a static display registry).

### The contract

- **`index.ts`** — read loaders wrapped in `React.cache()` so a guard called twice in one render hits the API once. Marked `'server-only'`. Maps service DTOs into the shapes the UI renders where they differ.
- **`actions.ts`** — `'use server'` at the top. Each export: typed call from `shared/api.ts` → catch `ApiError` into `{ error: message }` → `revalidatePath(...)`. NO business validation beyond friendly-error zod parses — the service is the source of truth and will 422.
- **Full-replace updates**: the PATCH/PUT endpoints replace the whole text field set (name + description + i18n). Updating actions must receive the complete fields from the UI (which holds the tree in memory) so a rename doesn't wipe translations.
- **Auth**: `features/auth` exposes `getSession` / `verifySession` / `requireActiveOrganization` / `requireRestaurantBySlug` / `requireStaff`. These only decide where to SEND the visitor; authorization is enforced by the services on every call.

### Cross-slice rules

- Files **inside** a slice import siblings via relative paths.
- Files **across** slices import only via the sibling barrel (`@/features/auth`) or the sanctioned subpaths: `actions`, `ui/**`, `rsc/**`. Everything else is slice-private.
- `src/shared/*` is freely importable — the only horizontal layer (`api.ts`, `url.ts`, `env.ts`, `ui/`).
- Slices don't call each other's loaders from server code; coordination happens in the action shell or the page component that composes both.
- **No cross-product imports.** Menu reaches `@iedora/api-client` / `@iedora/ui`; nothing reaches across products' source trees.

### The Next.js boundary

- **`'use server'`** lives only in `actions.ts`. Next's directive doesn't traverse barrels reliably — re-exporting an action through `index.ts` silently breaks it.
- **`'server-only'`** lives at the top of `index.ts` barrels and `shared/api.ts`. Crashes at import if anything pulls the module into a Client Component.
- **Slice-owned UI** lives at `src/features/<slice>/ui/*`. Client components declare `'use client'`; Server Components do not need a marker.
- **Route files** in `src/app/` are composition shells: call slice loaders + render slice UI. The route should be small enough to read in one screen.
- **No `middleware.ts`.** Next 16 renamed it to `proxy.ts`. The proxy owns host dispatch + the access-token refresh; redirects there are the gate, authorization lives in the services.

### How to add a feature

1. Add/extend the endpoint functions + DTOs in `src/shared/api.ts` (mirror the service handler — read `services/<svc>/src/`).
2. `mkdir src/features/<slice>/{ui}` — `ui/` only if needed.
3. Wire **`index.ts`**: `React.cache()`-wrapped loaders over the api functions, re-export types.
4. If mutations, add **`actions.ts`** with `'use server'`. Each action: api call → `ApiError` → `{ error }` → revalidate.
5. Pure domain helpers (formatting, layout math, validation hints) get co-located Vitest suites.
6. Compose the slice from `src/app/`. The route file should be a thin shell.
7. Backend behaviour changes (new fields, new rules) are service work first — `services/` — then the TS contract follows.

## Cross-product hard rules

These bind every product that ships UI to humans (menu + house, plus any future surface).

### 1. Components carry `data-test-id`

Interactive elements — buttons, links, list items, table rows, cards, dialog/sheet roots, status pills, the trigger of any compound widget (Combobox, DropdownMenu, Tabs, …) — MUST expose a `data-test-id` attribute.

Tests target by intent (`getByTestId('qr-codes-create-button')`), not by visible text (drifts with i18n + copy edits) or CSS class (drifts with Tailwind refactors).

**Convention:** `<slice>-<role>[-<modifier>]`. Collections use a stable id suffix:
```
data-test-id="qr-codes-create-button"
data-test-id="menu-builder-item-row-{itemId}"
data-test-id="sessions-revoke-button-{sessionId}"
```

**Form inputs** with an existing `id` + `htmlFor` pair already have a stable selector — adding `data-test-id` is harmless but optional.

**UI primitives** (`@iedora/ui`) forward `data-test-id` to their root via the standard prop-spread; never re-declare on the consumer.

### 2. Visible UI text goes through translation

Every string a user reads in the chrome — button labels, headings, placeholders, helper text, toast messages, error copy, page titles, empty states — MUST be wired through the product's translation library.

**Menu** uses `next-intl`:
- `useTranslations()` in Client Components
- `getTranslations()` in Server Components / route handlers
- Catalogues at `src/i18n/messages/<locale>.json`

**House** lives inside the menu Next.js app at `src/app/house/` and also uses `next-intl`.

**Hard-coded user-visible strings in components are a regression.**

**Exceptions:**
- Brand strings (`@/shared/brand`) — name, taglines, addresses.
- Inline format placeholders (`{0}`, `{count}`) — i18n library handles them.
- `data-test-id` values + other selectors — they're not user-visible.
- Server-side log / error messages thrown for operators (`console.error('[auth/callback] code exchange failed')`) — operator-facing, not user-facing.

**New keys land in EVERY locale catalogue in the same commit.** A missing key renders the namespace path as fallback (`Settings.Slug.label`) — louder than a wrong translation but still wrong.

## Commands

### Root

| Comando | O que faz |
|---|---|
| `bun install` | Instala/refresca dependências de todos os workspaces (instala git hooks via `postinstall`). |
| `bun run dev` | `next dev` em `:3000` (Next lê `apps/web/.env` + `.env.local`). |
| `bun run api:up` | Boot do backend completo (`docker compose up -d --build`). |
| `bun run api:down` | Pára containers (mantém volumes). |
| `bun run api:logs` | Tail dos logs do compose stack. |
| `bun run api:reset` | Pára + apaga volumes (**perde dados locais**). |
| `bun run typecheck` | TS check paralelo em todos os workspaces. |
| `bun run lint` | ESLint paralelo em todos os workspaces. |
| `bun run test` | Testes de todos os workspaces (ver Workspace standard). |

### Workspace standard

Every workspace follows the same shape so tooling is predictable across
products and packages:

- **`typecheck`** — always `tsgo` (never `tsc`). `tsgo --build` for the
  packages that orchestrate project references (`products/*/web`, `apps/web`);
  `tsgo --noEmit` everywhere else.
- **`lint`** — two linters, one gate. The root `oxlint` correctness pre-pass
  runs first (Rust, whole repo in <1s), then per-workspace ESLint runs the
  type-aware / react-hooks / boundaries rules oxlint can't. Each workspace
  **inherits** one of the shared presets from `@iedora/eslint-config` in a
  single line (`export { default } from '@iedora/eslint-config/<preset>'`) —
  the rule set has one source of truth, packages only pick a flavor:
  - libs + backends (`services/*`, `products/*/api`, `packages/**`) → `/lib`
  - React component libs (`packages/ui`) → `/react-lib`
  - Next products (`products/*/web`) → `/next-product` (menu composes it with
    `boundaries()` for its slice rules)
  Each preset ends with `eslint-plugin-oxlint`, which disables the ESLint rules
  the oxlint pre-pass already covers so the two never double-report. The
  React-Compiler advisory rules (`react-hooks/set-state-in-effect`,
  `react-hooks/purity`) are `warn` — they fire on valid SSR mount-guards,
  debounce hooks, and `Date.now()` in async RSCs. Correctness rules
  (`rules-of-hooks`, `exhaustive-deps`, `react-hooks/static-components`) stay
  `error`.
- **`test`** — tiered by what the code is:
  - backends (`services/*`, `products/*/api`, runtime libs) → `bun test`
    (bun's native runner, `bun:test`). Declared **only where tests exist** —
    an empty backend has no `test` script, so the runner skips it.
  - browser/React code + the libs that ship into the Next bundle
    (`products/*/web`, `ui`, `api-client`, `brand`, `contracts`,
    `observability`) → `vitest run --passWithNoTests`.
  - `apps/web` keeps a passthrough — its in-package tests are Playwright e2e
    under `apps/web/tests`, not vitest units.

### apps/web

| Comando | O que faz |
|---|---|
| `bun run dev` | `next dev` (Turbopack). Normalmente chamado via root `bun run dev`. |
| `bun run build` | `next build` (standalone output para o Dockerfile). |
| `bun run start` | `next start` no output standalone. |
| `bun run typecheck` | `tsgo --build`. |
| `bun run lint` | ESLint com cache. |

### services/ (backend)

Convenções e comandos dos serviços vivem em [`services/AGENTS.md`](./services/AGENTS.md). Testes correm via `bun test`; cada serviço é dono das suas migrations e aplica-as no arranque do compose.

### Dev local

```bash
bun install
bun run api:up           # backend completo (compose.yaml)
bun run dev              # next dev em :3000
```

App env vive em `apps/web/`:
- `.env` — defaults dev (`AUTH_URL`/`MENU_URL` + `NEXT_PUBLIC_*`). Tracked, sem secrets.
- `.env.local` — overrides locais. Gitignored.


## CI

GitHub Actions, [`.github/workflows/ci.yml`](.github/workflows/ci.yml):
path-filtered **correctness** (`typecheck` + `lint` + `test`, all routed through
Turborepo so unchanged packages are cache hits — `.turbo` is persisted across
runs) and **security** (gitleaks + hadolint on both images + osv-scanner), behind
a `ci-ok` fan-in gate. `lint` runs the **oxlint** correctness pre-pass before the
per-package ESLint. Image build / push / deploy live in the `iedora-infra` repo.

Task orchestration is [`turbo.json`](./turbo.json) — `bun run typecheck|lint|test`
= `turbo run …`. `scripts/run-parallel.mjs` is kept as a no-cache fallback
(`bun run typecheck:parallel`).

## Where to look when unsure

1. `node_modules/next/dist/docs/` — bundled, version-matched Next.js docs.
2. `services/AGENTS.md` — the backend services' architecture + conventions.
3. `products/menu/web/src/shared/api.ts` — the typed contract the UI consumes.
4. `products/menu/web/src/features/` — the menu slices (`products/tutor/web/src/features/` for tutor).
5. `.agents/skills/` — project-specific skills (add-language, add-template, reorder-positions, etc.)
