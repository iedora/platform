# iedora

Bun-workspaces monorepo for two products and three shared packages.

- **Menu** (`menu.iedora.com` — `products/menu/`) — Next.js 16 SaaS for restaurants to build digital menus by drag-and-drop. Public menu at `/r/<slug>`; admin dashboard with reorderable categories, items, image uploads, themes, multi-language overrides, plans, analytics.
- **House** (`iedora.com` — `products/house/`) — Astro static umbrella landing. No DB, no auth.

Identity is Zitadel (`auth.iedora.com`, self-hosted). Menu is a thin OIDC client — see `products/menu/src/features/auth/`.

## Run it locally

```bash
bun install                            # at the repo root
just dev                               # OpenTofu boots the full stack
                                       # (postgres, localstack, zitadel,
                                       # openobserve, house, menu container)
```

For Next HMR on the menu app, opt out the container:

```bash
just dev --except menu
cd products/menu && bun run dev        # reads .env + .env.local (TF-managed)
```

`bun run` lists every script; `just` lists every deploy target.

## Docs

- **[`AGENTS.md`](AGENTS.md)** — tech stack, hard rules, file layout, conventions (loaded by AI assistants too).
- **[`docs/architecture.md`](docs/architecture.md)** — vertical-slice + hexagonal playbook, how to add a feature.
- **[`docs/testing.md`](docs/testing.md)** — Vitest + PGLite unit tests, Playwright e2e.
- **[`docs/deploy.md`](docs/deploy.md)** — single-box self-host on Hetzner: Tofu-managed Docker + Caddy, brand-new-machine walkthrough.
- **[`docs/scaling.md`](docs/scaling.md)** — when one box isn't enough: vertical resize, sharding paths.
- **[`docs/backups.md`](docs/backups.md)** — daily Postgres dumps to Cloudflare R2 via a Tofu-managed backup container + recovery procedures.
- **[`docs/secrets.md`](docs/secrets.md)** — where every credential lives (BWS + Tofu state), rotation procedures, leak-response playbook.
- **[`docs/observability.md`](docs/observability.md)** — OTel wiring + OpenObserve recipes.
- **[`docs/tenancy.md`](docs/tenancy.md)** — multi-tenant model + Zitadel org mapping.
- **[`docs/infra/auth.md`](docs/infra/auth.md)** — Zitadel deploy, bootstrap, day-2 ops.
- **[`docs/terraform-style.md`](docs/terraform-style.md)** — LLM-safe HCL conventions.

## License

Not yet declared.
