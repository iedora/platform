# Tech debt queue

Real cleanup items — things that work but could be more idiomatic /
less repetitive / more aligned with industry standards. None of these
are bugs; none block product work. Order is rough priority.

Tag legend:
- **size:** S (< 1h), M (< 1 day), L (multi-day)
- **risk:** low / med / high (chance of breaking something during cleanup)

---

## CI / GitHub Actions

### CI-1: BWS install + GHCR login boilerplate duplicated across workflows
**size:** S · **risk:** low

The 8-line "Install bws CLI" + 7-line "Log in to GHCR" patterns repeat
across `web.yml` + `infra-deploy.yml` (×2 jobs after consolidation) +
`deploy.yml` + `app-state.yml`. ~50 lines of repetition. Adding a new
workflow that needs BWS access copies the same snippets again.

Fix: composite actions at
- `.github/actions/install-bws/action.yml` (input: BWS_ACCESS_TOKEN)
- `.github/actions/ghcr-login/action.yml` (uses install-bws)

### CI-2: SSH key write boilerplate duplicated across 3 workflows
**size:** S · **risk:** low

The 7-line block that writes `IAC_BOOTSTRAP_SSH_PRIVATE_KEY` to
`~/.ssh/id_ed25519` + adds the agent appears in `infra-deploy.yml`,
`app-state.yml`, `deploy.yml`. Same fix as CI-1: composite action.

### CI-3: web.yml has 76 lines of inline shell in `run:` blocks
**size:** M · **risk:** low

Polling loops + bws-fetch + multi-step build orchestration grew
inline. Extract to `.github/scripts/wait-app-state.sh` or composite
actions. `app-state.yml`, `deploy.yml`, `infra-deploy.yml` have
similar but smaller blocks (30-40 each).

### CI-5: workflows over-trigger on irrelevant changes
**size:** S · **risk:** low

Two distinct over-triggering issues observed in practice:

**(a) `[security] CodeQL`** runs on every push to main except for the
narrow `paths-ignore` list (`*.md`, `docs/**`, `LICENSE*`,
`.gitignore`, `.editorconfig`). That means it fires on:
- Any workflow file edit (`.github/workflows/*.yml`) — no source code
  scanned, but a full 20-min SAST runs anyway.
- Tofu HCL changes (`infra/iac/tofu/**`) — no JS/TS to scan.
- Go-only changes (`infra/**/*.go`, `internal/**`) — JS/TS analyzer
  doesn't apply.
- Config-only changes (`vitest.config.ts`, `drizzle.config.ts`, etc.)
  — touches no business code.

Fix: switch from `paths-ignore` (denylist) to `paths` (allowlist),
listing only paths that contain JS/TS source:
```yaml
paths:
  - '**/*.ts'
  - '**/*.tsx'
  - '**/*.mts'
  - '**/*.js'
  - '**/*.mjs'
  - '**/*.cjs'
  - 'bun.lock'
  - 'package.json'
```
Weekly cron still catches anything missed.

Previous reasoning (in codeql.yml header comment): "SAST signal lives
in cross-cutting taint flow — a vuln in a shared package can surface
only when reached from a product's entrypoint". Valid argument, but
the same logic doesn't apply when ZERO JS/TS files change — there's
nothing new to taint-flow into.

**Required before landing the optimization — security coverage audit:**
Confirm that EVERY security-relevant path is still scanned by SOMETHING
on every change to it. Coverage matrix to verify:

| Path | What scans it today | Still scanned after CI-5? |
|---|---|---|
| `apps/web/**`, `products/**`, `packages/**` | CodeQL (push+PR) + Trivy in web.yml | YES (paths allowlist matches) |
| `bun.lock` | dependency-review (PR) + Trivy (every web.yml run) | YES (allowlisted) |
| `infra/**` Go code | nothing today (CodeQL JS/TS-only) | NO CHANGE — gap exists, not new |
| Tofu HCL `infra/iac/tofu/**` | nothing | NO CHANGE — out of CodeQL scope |
| `.github/workflows/**` | nothing (actionlint local, not CI) | NO CHANGE — separate issue (SEC-2 below) |

The audit IS the gate — don't land CI-5 without confirming each row
above is acceptable. Add a SEC-1 ticket for Go code SAST coverage if
desired (CodeQL `go` analyzer or staticcheck).

### SEC-1: Go code has no SAST coverage
**size:** M · **risk:** low

Stage-3/4 orchestrator (`infra/deploy/cmd/iedora/`, `infra/iac/cmd/`,
`internal/`) is ~3k LOC of Go that handles SSH, BWS tokens, postgres
URLs, and `docker run`-shaped command-building. CodeQL today runs
only the `javascript-typescript` analyzer; no Go scan.

If/when this matters: add `go` to the codeql.yml language matrix and
`security-extended` queries cover Go too. Bigger CI cost (~10 extra
min/run); justified if the Go surface grows or starts handling
untrusted input.

### SEC-2: GitHub Actions workflows have no policy scan
**size:** S · **risk:** low

`actionlint` runs LOCALLY (used during this session) but isn't in CI.
Workflows can drift into anti-patterns: missing `permissions:`
declarations, untrusted `pull_request_target` inputs interpolated
into shell, deprecated runners, supply-chain risks from unpinned
actions (now using tag refs — see tech-debt note on CI elsewhere).

Fix: add a workflow that runs `actionlint` + optionally
`pinact`/`zizmor` on every PR + push that touches
`.github/workflows/**`. ~5 min CI cost, blocks bad practice early.

**(b) Per-product / per-package CIs include `bun.lock` + `package.json`
in their paths.** Any dep update (e.g. bumping a dev dep at the
workspace root) triggers EVERY product + package CI to re-run, even
when their own code is untouched. Bun workspaces hoist deps to the
root, so a `bun.lock` diff often touches every workspace's effective
deps — but the per-product CI is meant to gate the product's own
typecheck + lint + test, not whether any of its transitive deps
changed.

Fix: drop `bun.lock` + `package.json` from the per-workspace paths
filters. A workspace-root `[deps] CI` workflow (TBD — could just be
`bun install --frozen-lockfile` + smoke-typecheck of every workspace)
would handle the "dep change broke something" case once.

### CI-4: ~~cross-workflow gating via `gh run list` polling~~ → resolved
**size:** ~~L~~ · **risk:** ~~med~~

Original problem: `web.yml::wait_app_state` polled the LATEST
`app-state.yml` run on main — which could be a totally different
commit's run (often cancelled or stale). Caused Day-1 to fail with
"app-state.yml cancelled — refusing to deploy" even when infra was
fine.

Resolved by switching `web.yml::run_app_state` to a **dispatch +
follow-by-run-id** pattern: snapshot the latest app-state run, run
`gh workflow run app-state.yml`, poll until a new run appears, then
poll THAT specific run-id for completion. Deterministic — no
ambiguity about which run gates the deploy.

Side change: dropped the `workflow_run` cascade trigger on
`app-state.yml` (it was unreliable in practice — fired ~half the
time, possibly due to GHA's "workflow file must be on default
branch" race during rapid commits).

---

## Docker / runtime

### DOCKER-1: ~~migrate scripts piggyback the Next standalone image~~ → resolved
**size:** ~~M~~ · **risk:** ~~low~~

**Original problem**: Stage-3 configurators ran
`docker run --rm ghcr.io/eduvhc/web:latest node /app/packages/auth/scripts/migrate.mjs`,
piggybacking the Next.js app image. Next's standalone trace placed
`drizzle-orm` at `/app/apps/web/node_modules/` (apps/web-relative
globs), so Node's parent-walk from `/app/packages/auth/scripts/`
never found it. A symlink hack briefly papered over this; the
symlinks pointed at directories that didn't exist in CI (`bun install
--frozen-lockfile` is stricter than local — doesn't create courtesy
symlinks in apps/web/node_modules for transitive deps).

**Resolved by option (b) — bundle the migrate scripts.** New
`migrate-bundler` stage in `apps/web/Dockerfile` runs
`bun build --target=node --format=esm` on each migrate.mjs, producing
self-contained ESM files with drizzle-orm + postgres-js inlined.
Image layout:
```
/app/migrate/core/scripts/migrate.mjs   bundled @iedora/auth migrator
/app/migrate/core/drizzle/              auth's *.sql + meta/_journal.json
/app/migrate/menu/scripts/migrate.mjs   bundled menu migrator
/app/migrate/menu/drizzle/              menu's *.sql + meta/_journal.json
```

Sibling `scripts/` + `drizzle/` layout preserves migrate.mjs's
existing `dirname(import.meta.url) + '/../drizzle'` resolution — no
source changes needed.

Updated invokers:
- `infra/app-state/core-db-migrations/main.go`:
  `node /app/migrate/core/scripts/migrate.mjs`
- `infra/app-state/menu-db-migrations/main.go`:
  `node /app/migrate/menu/scripts/migrate.mjs`

Removed `outputFileTracingIncludes` for migrate files from
`apps/web/next.config.ts` (Next standalone no longer involved).
Removed the runtime-stage symlinks from Dockerfile.

**Sources consulted** (added as a checkpoint per process discipline):
- [Drizzle docs §migrations](https://orm.drizzle.team/docs/migrations)
  — official: use `migrate()` from code in prod, not `drizzle-kit migrate`.
- [altan.fyi — Drizzle Migrations in a Monorepo](https://altan.fyi/drizzle-migration-monorepo/)
  — pattern: `COPY` migrations folder into image at known path, run
  migrate script with `migrationsFolder` pointing at it.
- [vercel/next.js#35437](https://github.com/vercel/next.js/discussions/35437)
  — standalone trace is for the request-serving path; not designed
  to host arbitrary node scripts.
- [Railway: Next.js deploy guide](https://docs.railway.com/guides/nextjs)
  — "pre-deploy migrations in a separate container" pattern.

Rejected alternatives at decision time:
- (a) dedicated migrate image: clean but 2× pushes per deploy.
- (c) run migrations from CI runner via SSH tunnel: cleanest but
  requires opening Postgres reach to the runner network — touching
  the firewall is bigger blast radius than wanted.

### DOCKER-2: migrate bundle still couples to Next image build
**size:** M · **risk:** low

DOCKER-1's fix bundled migrate scripts as a separate Dockerfile
stage (`migrate-bundler`), but kept the output in the SAME image as
the Next.js app. Cost: any SQL-file change in
`packages/auth/drizzle/` or `products/menu/drizzle/` invalidates the
deps-stage COPY which propagates to the Next builder stage, forcing
a full ~10min Next rebuild for a 1-keyword migration fix.

Schema migrations land much more often than Next code changes.
Coupling them to Next's build cycle was a deferred trade-off (see
DOCKER-1 — option (a) "Dedicated migrate image" was rejected for
"two pushes per deploy", which mispriced the SQL-vs-code change
frequency).

Fix: split off a separate `ghcr.io/eduvhc/migrate:<sha>` image.

  - `infra/migrate/Dockerfile` (new): just the migrate-bundler stage,
    plus a small runtime layer (node-slim + the bundles + sql).
    ~50MB.
  - `.github/workflows/migrate.yml` (new): builds + pushes on
    `packages/auth/drizzle/**`, `packages/auth/scripts/**`,
    `products/menu/drizzle/**`, `products/menu/scripts/**` changes.
  - Stage-3 configurators (Go) switch image:
      ghcr.io/eduvhc/web:<sha>  → ghcr.io/eduvhc/migrate:<sha>
  - apps/web/Dockerfile: drops the migrate-bundler stage and the
    `/app/migrate` copy. Next image stays focused on serving HTTP.
  - web.yml's `run_app_state` dispatch passes the migrate SHA, not
    the web SHA. (They drift independently now.)

Deferred until DOCKER-1's bundle approach validates end-to-end at
least once. Tracked here so the work isn't lost.

## TypeScript / monorepo

### TS-1: Composite TS project references only on `products/menu`
**size:** M · **risk:** med

`products/menu` is the only workspace using `composite: true` +
`emitDeclarationOnly: true` because it was the only one with internal
`@/` paths (now removed, but composite is the proper monorepo
shape regardless). Other workspaces (packages/auth, packages/db,
products/core, etc.) still use plain `tsc --noEmit`.

Going composite for all: each workspace gets `tsconfig.json` with
composite settings + apps/web declares full `references:` list.
Benefits: incremental + cached typecheck, true .d.ts boundaries.
Cost: per-workspace `dist/`, more moving pieces.

Defer unless typecheck speed becomes a real annoyance.

### TS-2: Per-workspace script naming inconsistency
**size:** S · **risk:** low

Lint scripts: most workspaces use `eslint src` but `products/menu`
and `apps/web` just use `eslint` (which picks up scope from
`eslint.config.mjs`). Functionally identical, just style drift.

Test scripts: mix of `vitest run` and `vitest run --passWithNoTests`.
The `--passWithNoTests` flag is correct for workspaces that don't
have tests yet — but ideally a CI-level convention (workflow checks
if test files exist before invoking).

### TS-3: No root-level orchestrator scripts
**size:** S · **risk:** low

`package.json` at root has an empty `"scripts": {}`. Want to typecheck
the whole monorepo? Loop per-workspace via shell. A root `typecheck`
script (or proper task runner like Turborepo / Nx / Bun's recent
task primitive) would centralize "run X across every workspace".

For now, CI has per-workspace jobs which serves the same goal.

### TS-5: no task-graph cache — build/lint/test re-run on every workflow invocation
**size:** L · **risk:** med

Even when nothing in a workspace changed since the last successful
run, `[apps:web] CI` (and every per-product/package CI) runs:
- `actions/checkout@v6` — full clone
- `oven-sh/setup-bun@v2` — Bun install
- `bun install` — install deps (cached partially)
- `tsc` typecheck — no cache (TS-1 partially addresses for composite menu)
- `eslint` — no cache (`--cache` flag exists but unused)
- `vitest run` — runs all tests (`--changed` exists but unused)
- `docker buildx build` — uses GHA cache (`cache-from: type=gha`)

GHA itself doesn't skip equivalent invocations; the job dispatcher
runs the steps regardless. CI-5 trims WHICH workflows trigger;
this ticket is about making each invocation cheap when its inputs
are unchanged.

True industry standard: a task-graph cache like **Turborepo** or
**Nx**. Each task's inputs hash to a key; first run populates a
remote cache (S3/R2); subsequent runs that hash to the same key
read the cached output (logs + artifacts) and skip the work entirely.

For this repo specifically:
- Turborepo + Bun workspaces is the canonical pairing.
- Remote cache could live in the existing R2 bucket.
- `turbo run typecheck lint test build` at the root replaces
  per-workspace dispatches; CI calls turbo once.

Cheaper interim wins (without adopting a task runner):
- Add `--cache --cache-location .eslintcache` to every `lint` script.
  ~50% faster on warm runs. Per-workspace, no graph.
- Add `vitest --changed origin/main` mode for PRs. Skips tests for
  files git-unchanged vs main.
- Composite TS (TS-1) extends `.tsbuildinfo` to every package; tsc
  reuses prior typecheck results.
- `actions/cache` with key = `bun.lock` hash for `node_modules`
  install step. Already partially done by oven-sh/setup-bun cache,
  but the workspace-internal `node_modules/.bun` could be cached too.

None of these match the leverage of a real task runner. Defer
until CI cost or wall-time becomes painful — currently each run is
~3-10 min which is tolerable.

### TS-4: drizzle-orm version pinned in 4 workspaces independently
**size:** S · **risk:** low

`packages/auth`, `packages/db`, `products/menu`, `products/imopush`
each declare `"drizzle-orm": "^0.45.2"`. If one drifts, weird type
mismatches. Bun's recent `catalog:` feature (or pnpm's catalog)
would let us declare the version once at workspace root and
reference it per-package.

---

## Code-level

### CODE-1: TODO in restaurant-identity actions
**size:** S · **risk:** low

`products/menu/src/features/restaurant-identity/actions.ts:78` has a
`TODO(language-switch-ui)` about surfacing a count to the UI. Real
product task, not architecture; tracked as code, not on a backlog.

---

## Anti-debt (things that LOOK like hacks but aren't, documented for clarity)

- **`apps/web/public/.gitkeep`** — canonical solution for tracking an
  empty directory (git can't track dirs natively). Standard, not a hack.
- **`*.tsbuildinfo` in `.gitignore`** — tsc incremental output;
  excluding from source control is correct.
- **`menu_database_url` / `menu_public_url` in Tofu outputs** —
  describe the resource (postgres DB named `menu`, URL
  `menu.iedora.com`), not the consumer. Renaming would be wrong.
- **Per-product `MENU_PUBLIC_URL` env var in web container** — the
  menu-subdomain URL is genuinely menu-specific even though it's
  read by the unified `web` container.
- **`products/menu/tsconfig.tests.json` non-composite** — tests +
  configs include files outside `src/` (drizzle.config, vitest.config,
  instrumentation.ts) that composite mode would refuse. Non-composite
  for tests is the right shape.
- **`MENU_IMAGE_SHA` → `IMAGE_SHA` env name** — already cleaned up.
  Carrying the rename across BWS keys would be next-level overkill
  (no consumer reads from BWS for this).
