# E2E architecture

How every product runs browser-driven end-to-end tests, why they live where they live, and how to add a new product to the suite.

## Principles

| Principle | Detail |
|-----------|--------|
| **E2E in Stage 1** | Full Playwright suite runs pre-merge in product CI workflows. Gates the merge, not the deploy. |
| **Smoke in Stage 4** | Post-deploy verification is HTTP-only (`/up` probe in `deploy.yml`). No Playwright touches production. |
| **No staging tier** | Guardrail from `docs/deploy/README.md`. The hot-swap `-next` slot is a canary slot, not a staging environment — E2E mutates data and MUST NOT touch the live database. |
| **Path-filtered per product** | Each product's CI workflow triggers only when its workspace or deps change. Menu E2E doesn't run when core changes. |
| **One Next.js shell** | Every product serves through `apps/web` (Next.js 16, host-based proxy). E2E builds the full shell once per product workflow. |
| **Inline E2E jobs** | No reusable `workflow_call` for E2E — each product owns its `e2e` job inline, sharing a composite action for the common pipeline steps. |

## Architecture

```
 ── Stage 1: per-product CI ──              ── Stage 4: deploy ──

  product-menu.yml                          deploy.yml
  ┌───────────────────────┐                ┌───────────────────┐
  │ typecheck              │                │ docker pull       │
  │ lint                   │   web.yml      │ hot-swap          │
  │ unit (Vitest + PGLite) │  ┌──────────┐  │ /up smoke (HTTP)  │
  ├───────────────────────┤  │ build    │  └───────────────────┘
  │ e2e (needs gates)     │  │app-state │
  │  ├ services:           │  │ deploy   │
  │  │  postgres:18        │  └──────────┘
  │  │  s3mock             │
  │  └ steps:              │
  │     └ e2e-run (composite)
  │        ├ wait services
  │        ├ db:migrate:test
  │        ├ playwright install
  │        ├ build apps/web  ← every product needs this
  │        ├ run specs
  │        └ upload report
  └───────────────────────┘

  product-core.yml (future)
  ┌───────────────────────┐
  │ typecheck              │
  │ lint                   │
  │ unit (Vitest + PGLite) │
  ├───────────────────────┤
  │ e2e (needs gates)     │
  │  ├ services:           │
  │  │  postgres:18        │  ← no S3Mock needed
  │  └ steps:              │
  │     └ e2e-run (composite)
  └───────────────────────┘
```

## The runtime dependency

Every product E2E suite needs a running `apps/web` (the Next.js shell that serves menu.iedora.com, core.iedora.com, and iedora.com via host-based proxy). The composite action handles the production build:

```
cd apps/web && bun --env-file=../../<product>/.env.test next build
```

**Trade-off:** If a PR touches both `products/menu/` and `products/core/`, two full `next build`s run — one per product workflow. This is rare in practice (most PRs touch a single product) and the cost of coordinating a shared build across workflows is higher than the occasional duplicate.

## Composite action: `e2e-run`

**Location:** `.github/actions/e2e-run/action.yml`

Shared Playwright harness for products that serve through `apps/web`. The caller declares `services` (Postgres ± S3Mock) and `matrix.shard`; the action runs the common pipeline.

**Inputs:**

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `product` | yes | — | Product name (menu, core). Used for artifact naming. |
| `working_directory` | yes | — | Path from repo root to product (e.g. `products/menu`). |
| `db_name` | yes | — | Postgres database name (e.g. `menu_test`). |
| `needs_s3mock` | no | `false` | Whether S3Mock is needed. |
| `shard` | no | `1/1` | Playwright shard index. |
| `grep_invert` | no | `@flaky` | Passed to `--grep-invert`. |

**Steps executed by the action:**

1. Wait for S3Mock + create bucket (only if `needs_s3mock: true`)
2. Apply DB migrations (`bun run db:migrate:test`)
3. Install Playwright browsers (`playwright install --with-deps chromium`)
4. Build `apps/web` (production Next.js build against the product's `.env.test`)
5. Run Playwright (`bun run test:e2e -- --grep-invert "@flaky" --shard=N/M`)
6. Upload Playwright HTML report as artifact (14-day retention)

**What the caller declares (not part of the action):**

- `services:` block (Postgres, optional S3Mock)
- `strategy.matrix.shard`
- `checkout` + `setup` composite actions
- `needs: [typecheck, lint, unit]`
- Job-level `timeout-minutes`, `runs-on`, `permissions`

## Per-product checklist

Each product that adds E2E needs:

### Files

```
products/<product>/
├── playwright.config.ts        # webServer → ../../apps/web, testMatch globs, testIdAttribute
├── .env.test                   # DATABASE_URL, CORE_DATABASE_URL, S3_* (if needed)
├── tests/e2e/
│   ├── global-setup.ts         # Truncate the test DB before the suite
│   ├── global-teardown.ts      # Close the DB pool
│   └── fixtures.ts             # pageErrors + signedInPage + signIn
├── src/shared/testing/
│   └── e2e-db.ts               # testDb(), truncateAll(), closeTestDb()
└── src/features/*/
    ├── testing/                 # Slice test surface (profile, seeds, routes, barrel)
    └── e2e/<capability>.spec.ts # Co-located Playwright specs
```

### `package.json` scripts

```json
{
  "scripts": {
    "test:e2e": "bun --env-file=.env.test playwright test",
    "db:migrate:test": "bun --env-file=.env.test --bun drizzle-kit migrate"
  }
}
```

### CI workflow job

```yaml
e2e:
  name: E2E (Playwright)
  needs: [typecheck, lint, unit]
  runs-on: ubuntu-24.04
  timeout-minutes: 20
  strategy:
    fail-fast: false
    matrix:
      shard: ['1/1']
  services:
    postgres:
      image: postgres:18
      env:
        POSTGRES_PASSWORD: Password1!
        POSTGRES_DB: <db_name>
      ports: [5432:5432]
      options: >-
        --health-cmd "pg_isready -U postgres"
        --health-interval 5s
        --health-timeout 3s
        --health-retries 10
    # s3mock: ... (only if needs_s3mock)
  steps:
    - uses: actions/checkout@v6
    - uses: ./.github/actions/setup
    - uses: ./.github/actions/e2e-run
      with:
        product: <name>
        working_directory: products/<name>
        db_name: <db_name>
        needs_s3mock: 'true'   # or omit (defaults to false)
        shard: ${{ matrix.shard }}
```

### Paths filter

Add these entries to the workflow's `on.push.paths` and `on.pull_request.paths`:

```yaml
- '.github/actions/e2e-run/**'
- '.github/scripts/wait-s3mock.sh'    # only if needs_s3mock
```

## Tagging strategy

Tags live in `test.describe` titles. Use `--grep` / `--grep-invert` on the Playwright CLI.

| Tag | Meaning | CI behaviour |
|-----|---------|--------------|
| `@critical` | Tenancy, auth, billing | Always runs |
| `@smoke` | Happy path for a slice | Always runs |
| `@journey` | Cross-slice flow | Always runs |
| `@flaky` | Quarantined | **Excluded** via `--grep-invert "@flaky"` |
| `@slow` | >10s typical | Nightly only (not wired yet) |

CI invocation: `bun run test:e2e -- --grep-invert "@flaky" --shard=N/M`

## Adding a new product

1. Copy the file layout from § Per-product checklist.
2. Create `playwright.config.ts` — point `webServer` at `../../apps/web/`, wire `testIdAttribute: 'data-test-id'`, set `testMatch` for the product's spec directories.
3. Create `.env.test` with the product's DB URLs.
4. Add `test:e2e` and `db:migrate:test` scripts to `package.json`.
5. Write `tests/e2e/global-setup.ts`, `global-teardown.ts`, `fixtures.ts`, and `src/shared/testing/e2e-db.ts`.
6. Write the first slice-level spec under `src/features/<slice>/e2e/`.
7. Add the `e2e` job to the product's CI workflow following the template in § CI workflow job.
8. Update the workflow's `paths:` filter.

## CI integration summary

| Product | Workflow | Jobs | Services | Artifact |
|---------|----------|------|----------|----------|
| menu | `product-menu.yml` | typecheck + lint + unit + **e2e** | postgres:18 + s3mock | `playwright-report-menu-*` |
| core (future) | `product-core.yml` | typecheck + lint + unit + **e2e** | postgres:18 | `playwright-report-core-*` |
| web | `web.yml` | typecheck + lint + security + build + run_app_state + deploy | — | SBOM |
| deploy | `deploy.yml` | deploy + smoke | — | — |

## What we DON'T do

- **E2E in `web.yml`.** E2E is per-product, co-located with the code it tests.
- **E2E post-deploy against production.** E2E mutates data. Smoke (`/up` probe) is sufficient for deploy verification.
- **Staging environment.** By design (`docs/deploy/README.md` Guardrail #1).
- **`@flaky` in CI.** Quarantined specs are excluded from PR runs. Flakes get fixed or stay in quarantine.
- **Shared `workflow_call` for E2E.** The composite action (`e2e-run`) handles the common pipeline; each product keeps its own inline job for path filtering and service declarations.
- **Sharding before it's needed.** Matrix is parked at `['1/1']`. Per-worker DB isolation is already wired (`src/shared/testing/e2e-db.ts::workerDatabaseUrl`, `MENU_TEST_ISOLATE_WORKERS=1`). Bump when suite >10 min.
