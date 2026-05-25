# Guardrails — implementation plan

> Companion to [deploy.md § Environment guardrails](./deploy.md#environment-guardrails).
> The guardrails doc says **what** the rules are. This doc says **how**
> we get there from today's code. One section per rule; each ends with
> a concrete, ordered task list and the files that change.
>
> Order of recommended landing: ~~Rule 5 → Rule 1 → Rule 2 → Rule 3 →
> Rule 4~~. All five guardrails landed.

## Status at a glance

| Rule | Title                              | Status      | Blast radius |
|------|------------------------------------|-------------|--------------|
| 1    | Binary environment (`local`/`live`)| ✅ landed   | done in `ab72194` |
| 5    | Zitadel anti-panic lock            | ✅ landed   | done — see this doc § Rule 5 |
| 2    | Tofu state in R2                   | ✅ landed   | done — see this doc § Rule 2 |
| 3    | Expand-contract migrations         | ✅ landed   | done — see this doc § Rule 3 |
| 4    | Zero-downtime hot-swap             | ✅ landed   | done — see this doc § Rule 4 |

## Rule 1 — binary environment ✅ landed (`ab72194`)

Single source of truth: [`internal/mode`](../internal/mode/) —
`Mode` enum (`Local | Live`), `Resolve` / `MustResolve` / `Require`
(panics on mismatch) / `IsLive` / `IsLocal`. Adopted across all 5
binaries:

- `cmd/iedora` — pinned to `Live`, with `Require(Live)` at the top of
  every destructive entry point (`runIacApply`, `runIacDestroy`,
  `runAppApply`, `runDeployProduct`, `runDestroyProduct`).
- `cmd/dev` — pinned to `Local`.
- `cmd/zitadel-apply` — the only dual-mode binary; takes `--mode
  live|local` (default `live`). Mode plumbs through `loadConfig`,
  `buildStore` (live → `bwsStore`, local → `memoryStore`), `ensureSAKey`,
  and `waitForMenuDNS` (local short-circuits).
- `cmd/menu-db-migrations`, `cmd/openobserve-dashboards` — live-only
  by deployment topology; `const runsIn = mode.Live` documents it.

No back-compat surface — fresh ecosystem, no callers needed a
deprecation window.

## Rule 2 — Tofu state in R2

### Today
- `infra/tofu/terraform.tfstate` is git-tracked, encrypted with
  PBKDF2 + AES-GCM via the `encryption {}` block in `versions.tf`.
- CI workflows (`infra-deploy.yml`, `deploy.yml`) commit state back
  to `main` after every apply.
- Two state files in repo: `infra/tofu/terraform.tfstate` +
  `products/house/infra/tofu/terraform.tfstate`.

### Target
- OpenTofu `s3` backend pointed at the `iedora-tofu-state` R2 bucket.
  Native locking via R2 (DynamoDB-style lock table not supported by
  R2 → use Tofu's [`use_lockfile = true`](https://opentofu.org/docs/language/settings/backends/s3/#s3-state-locking)).
- State file gone from git; both state files `git rm --cached`'d and
  added to `.gitignore`.
- Bootstrap: a one-shot `infra/cmd/state-bucket-bootstrap/` Go binary
  creates the R2 bucket + scoped API token + writes the credentials
  to BWS under `IAC_BOOTSTRAP_TOFU_STATE_*`. Run once per fresh
  ecosystem. After that, `tofu init` consumes those credentials.
- `task infra:up` first-run flow: `tofu init -migrate-state` (move
  the in-repo encrypted file → R2). After that, no migrate flag.
- The `encryption {}` block stays — R2 sees encrypted bytes, never
  plaintext.

### The bootstrap problem
We can't manage the state bucket with Tofu and also keep state in it
— chicken-and-egg. Three options:

| Option | Approach | Trade-off |
|--------|----------|-----------|
| A | One-shot Go bootstrap binary creates bucket + token via CF API, writes to BWS. Bucket lives outside Tofu state. | Cleanest. Mirrors `bws-upsert`'s shape. One-time op. |
| B | Bucket managed by a tiny separate Tofu root (`infra/tofu-bootstrap/`) whose own state stays in git. | Two Tofu roots forever; the bootstrap one's state has to stay encrypted-in-git, which is the pattern we're escaping. Reject. |
| C | Manual CF dashboard creation. | Operator step we want to eliminate. Reject. |

**Pick A.**

### Migration steps
1. Write `infra/cmd/state-bucket-bootstrap/` — creates
   `iedora-tofu-state` R2 bucket, mints a scoped API token, writes
   `IAC_BOOTSTRAP_TOFU_STATE_ACCESS_KEY` +
   `IAC_BOOTSTRAP_TOFU_STATE_SECRET_KEY` to BWS. Idempotent.
2. Add to `bin/with-secrets --stage iac` env: `AWS_ACCESS_KEY_ID`
   and `AWS_SECRET_ACCESS_KEY` mapped from the BWS keys above.
3. Add the `backend "s3"` block to `infra/tofu/versions.tf` with
   `endpoints.s3 = "https://<acct>.r2.cloudflarestorage.com"`,
   `region = "auto"`, `skip_credentials_validation = true`,
   `skip_metadata_api_check = true`, `use_path_style = true`,
   `use_lockfile = true`.
4. Operator runs once: `bin/with-secrets --stage iac --
   tofu -chdir=infra/tofu init -migrate-state` — moves the
   in-repo state into R2.
5. `git rm --cached infra/tofu/terraform.tfstate
   products/house/infra/tofu/terraform.tfstate` and add both to
   `.gitignore`.
6. Drop the "commit tfstate back to main" steps from
   `.github/workflows/infra-deploy.yml` and
   `.github/workflows/deploy.yml`.
7. Drop the now-obsolete `### Encrypted state` section in
   `deploy.md`; replace with a `### State backend (R2)` section.
8. Repeat for `products/house/infra/tofu/` — second `backend "s3"`
   block, different key in the same bucket.

### Files
- `infra/cmd/state-bucket-bootstrap/main.go` (new)
- `internal/r2/bootstrap.go` (helper: create bucket + token)
- `deploy/with-secrets/env.go` (map state creds → AWS_* env)
- `infra/tofu/versions.tf` (add backend)
- `products/house/infra/tofu/versions.tf` (add backend)
- `infra/tofu/terraform.tfstate` (delete from index)
- `products/house/infra/tofu/terraform.tfstate` (delete from index)
- `.gitignore` (re-add the rules I added earlier in this session)
- `.github/workflows/infra-deploy.yml` (drop state commit-back)
- `.github/workflows/deploy.yml` (drop state commit-back)
- `docs/deploy.md` (rewrite § Encrypted state)
- `infra/CLAUDE.md` (drop the "state encrypted in git" claim)

## Rule 3 — expand-contract migrations ✅ landed

### What landed

A regex-based SQL linter in `app-state/menu-db-migrations/lint.go`
scans every `.sql` file under `products/menu/drizzle/` before the
`menu-db-migrations` configurator SSHes to the box. The matcher
catches five destructive patterns:

- `DROP COLUMN`
- `DROP TABLE`
- `ALTER COLUMN ... TYPE`
- `RENAME COLUMN`
- `RENAME TABLE`

Each destructive statement must carry a marker comment **in its own
`--> statement-breakpoint` block** to pass lint:

```sql
-- iedora:expand-contract phase=contract references=0000_init
DROP TABLE "menu"."old" CASCADE;
```

The grammar is `phase=<expand|migrate-data|contract>` plus an optional
`references=<expand-tag>`. Only `phase=contract` with a non-empty
`references=` unblocks a destructive statement; the other phases are
advisory (operator can label expand/migrate-data migrations for
downstream tooling, but they don't suppress lint errors).

Mode-aware gate (`gateMigrations`):

- **Live**: violations are a hard fail. The error names every
  violation with file:statement, the matched pattern, the rejection
  reason, and a recovery hint pointing at `docs/deploy.md § Rule 3`.
- **Local**: violations log to stderr but don't block. (Operator
  iterating on a destructive migration shouldn't have to commit +
  annotate every loop.)

### Retroactive annotation

`products/menu/drizzle/0001_drop_better_auth_tables.sql` was already
deployed before Rule 3 landed — it carries five `DROP TABLE` statements
that drop the better-auth tables retired by the Zitadel migration. The
file is now annotated with five `phase=contract references=0000_init`
markers (one per statement block). The integration test
`TestLintRealMigrations` keeps the annotation honest — if anyone
removes the markers, that test fails before the destructive migration
ever runs in live.

### What we *didn't* build

The original plan called for a `products/menu/drizzle/expand-contract.yaml`
registry that linked expand migrations to their contract pair and
verified the contract was at least one deploy later. Skipped: the
inline `references=<tag>` field already documents the linkage in the
SQL, and a separate registry would drift against the source of truth.
The integration test (`TestLintRealMigrations`) plus a future
`TestExpandContractPairing` (when we have the second contract migration
to test against) cover the verification surface adequately.

### Files

- [`app-state/menu-db-migrations/lint.go`](../app-state/menu-db-migrations/lint.go) — matcher + classifier + format + mode-aware gate.
- [`app-state/menu-db-migrations/lint_test.go`](../app-state/menu-db-migrations/lint_test.go) — 15 sub-cases (table-driven lintFileBody, dir-scan, mode gate, real-fixture integration).
- [`app-state/menu-db-migrations/main.go`](../app-state/menu-db-migrations/main.go) — wires `gateMigrations` at the top of `run()`, before SSH.
- [`products/menu/drizzle/0001_drop_better_auth_tables.sql`](../products/menu/drizzle/0001_drop_better_auth_tables.sql) — retroactive markers.

## Rule 4 — hot-swap deploy

### Today
- `deploy/iedora/runtime_docker.go::dockerOnHetzner.Deploy`
  does `docker stop && docker rm && docker run` via SSH-shelled
  commands. ~5s 502 window during every deploy (the failure-modes
  table acknowledges it).
- Caddy routes upstream by Docker network alias `infra-menu-web`.
  When the container is gone, Caddy returns 502 until the new one
  comes up.

### Target
- New deploy flow:
  1. Pull image (unchanged).
  2. Compute alias = `<container>-<short-sha>`.
  3. Start new container with two aliases on the `iedora` network:
     `<container>-next` (fixed handle) AND `<alias>` (the sha-tagged
     one). NOT `infra-menu-web` yet.
  4. Go-native HTTP probe `http://<box>/up` via SSH-tunneled curl OR
     `docker exec <container> wget -qO- localhost:3000/up` until
     200 OK or timeout.
  5. Atomically swap: `docker network disconnect iedora <old>`
     followed by `docker network connect --alias infra-menu-web
     iedora <new>`. The alias swap is the cutover instant.
  6. Drain (configurable; default 10s) then
     `docker stop <old> && docker rm <old>`.
- On probe timeout: leave the old container running, tear down the
  new one, surface a clear error.

### Trade-offs to decide
- **Probe path**: docker-exec'd `wget` is simpler, no Caddy reload
  needed. SSH-tunneled `curl` from the operator side proves the
  request travels the same network path Caddy does. Pick docker-exec
  for v1; revisit if false-positives appear.
- **Alias swap vs Caddy reload**: alias swap is faster (no Caddy
  config change), but Caddy caches upstream DNS within the network.
  Test: does Caddy honor live alias re-resolution? If not, fallback
  to Caddy reload via `docker exec infra-caddy caddy reload`.

### Migration steps
1. Add `Healthcheck` field to the `dockerOnHetzner` struct: `Path`
   string (e.g. `/up`), `Port` int (e.g. 3000), `Timeout`,
   `Interval`.
2. Rewrite `Deploy` along the hot-swap flow above.
3. Add `deploy/iedora/runtime_docker_swap_test.go` with table-
   driven tests for the probe-then-swap state machine using a fake
   SSH executor.
4. Update `### Failure modes` row "`menu.iedora.com` 502 between
   deploys" — should no longer fire.
5. Manual validation: `task deploy:menu` × 5, monitor
   `menu.iedora.com/up` in a loop with `--max-time 1` from a
   second terminal. Expect zero non-200s.

### Files
- `deploy/iedora/runtime_docker.go` (rewrite Deploy)
- `deploy/iedora/runtime_docker_swap_test.go` (new)
- `deploy/iedora/products.go` (add Healthcheck to menu)
- `docs/deploy.md` (§ dockerOnHetzner — drop the ⚠️, update flow)

## Rule 5 — Zitadel anti-panic lock ✅ landed

### What landed

The audit found exactly **two** branches in `reconcile.go` that could
silently `delete + recreate` a live IAM resource on a "BWS key missing"
signal:

| Branch | Resource | Blast radius |
|--------|----------|--------------|
| `reconcile.go::reconcilePAT` | PAT `menu-sa` access token | 🔴 critical — menu container loses Zitadel auth, every user logged out until new PAT lands in BWS + container restarts |
| `reconcile.go::reconcileOneTarget` | Action target (`menu-permissions`, `menu-grants`) | 🔴 high — ~1s webhook gap until `reconcileExecutions` rebinds; stale scope claims during the window |

Everything else in the 949-line reconciler is create-only on miss
(project, project-roles, machine-user, OIDC app, OIDC client_secret
which uses Zitadel's `regenerate` endpoint, not delete) or idempotent
POSTs (IAM owner grant, action executions, admin grants).

### How it's gated

`guardRecreate(cfg, resource, bwsKey, descriptor)` in `reconcile.go`:
- Local mode → returns `nil`, recreate proceeds. (Local IS supposed
  to mint fresh on cold boot.)
- Live mode + `cfg.AllowRecreate[resource]` true → returns `nil`,
  recreate proceeds. (Operator-authorised destructive recovery.)
- Live mode without opt-in → returns a structured error naming the
  missing BWS key, the live resource ID, and the exact
  `--allow-recreate=<resource>` token to use.

Operator flag: `--allow-recreate=pat,target:menu-permissions` (comma-
separated, parsed by `parseAllowRecreate`). No `all` token — opt-in
is one resource at a time.

### Files

- [`app-state/zitadel/reconcile.go`](../app-state/zitadel/reconcile.go) — `Config.AllowRecreate` + `guardRecreate` helper + gates at the PAT and target delete branches.
- [`app-state/zitadel/main.go`](../app-state/zitadel/main.go) — `--allow-recreate` flag + `parseAllowRecreate` (comma-separated → `map[string]bool`).
- [`app-state/zitadel/reconcile_test.go`](../app-state/zitadel/reconcile_test.go) — table-driven tests for `guardRecreate` (7 cases covering local short-circuit, live strict, live with matching/wrong opt-in) + `parseAllowRecreate` (7 cases for split/trim/dedupe/empty).
- [`docs/deploy.md` § Environment guardrails — Rule 5](./deploy.md#5-zitadel-reconciler--anti-panic-lock) — operator-facing copy.
