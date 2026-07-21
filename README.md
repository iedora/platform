# iedora-app

The iedora platform monorepo (Bun workspaces): one Next.js 16 web app (`apps/web`) serving every product as a host-routed **surface** — `iedora.com` (house/landing), `menu.iedora.com` (multi-tenant menu builder), and `tutor.iedora.com` (tutoring marketplace) — over a host-based rewrite (`src/proxy.ts` + `src/generated/surfaces.ts`), together with the Bun/Hono backend services (`services/`) that own data, auth and business rules. Each product's UI lives in a `products/<name>` slice package. Built and deployed via Kamal (see `iedora/infra`); the repo builds the `iedora-web` + `iedora-api` images.

📖 Documentation: https://docs.733113.xyz
