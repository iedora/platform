# Stage 3 — `app-state/`

Each subdirectory is a self-contained **configurator** — a Go binary that reconciles the application-level state of one running shared service. They run sequentially via `task app:apply` (Stage 3) after [`infra/`](../infra/) brings the service containers up.

The line: **infra** = "the service is running, port bound, network attached". **app-state** = "the org / project / schema / dashboard inside the running service is in the declared shape".

## Configurators

| Directory                       | Binary shim                                         | Owns                                                                                          |
|---------------------------------|-----------------------------------------------------|-----------------------------------------------------------------------------------------------|
| [`zitadel/`](zitadel/)                                   | [`bin/zitadel-apply`](../bin/zitadel-apply)         | The IdP's org, project, 6 roles, OIDC app, machine user + PAT, action targets + executions, admin email grants. |
| [`menu-db-migrations/`](menu-db-migrations/)             | [`bin/menu-db-migrations`](../bin/menu-db-migrations) | drizzle-kit migrate against menu's postgres DB via SSH + `docker run --rm` on the menu image. |
| [`openobserve-dashboards/`](openobserve-dashboards/)     | [`bin/openobserve-dashboards`](../bin/openobserve-dashboards) | 3 dashboards (business / technical / correlation) pushed via SSH `-L` tunnel; JSONs embedded via `//go:embed`. |

Registered in [`deploy/iedora/configurators.go`](../deploy/iedora/configurators.go) — the registry walks them sequentially. Order matters only when one depends on another (today: none do).

## Module contract

Every `app-state/<name>/` directory MUST:

1. Be a `package main` Go binary at its root. Multiple `.go` files are fine; no `cmd/` nesting.
2. Be idempotent — Stage 3 runs on every deploy.
3. Own its own health gate (don't start reconciling until the target service is reachable + ready). Cross-stage tools live in [`../internal/tlsprobe/`](../internal/tlsprobe/) for HTTPS probes.
4. Own its own credential fetch — read what it needs from env (hydrated by `bin/with-secrets --stage app`). No reaching into other configurators' state.
5. Co-locate embedded resources (dashboard JSONs, SQL files) under its own directory.
6. Surface failures with a clear stderr line + non-zero exit — the orchestrator just reports stage status.

## Adding a configurator

1. `mkdir app-state/<name>/` with a `package main` `main.go`.
2. Write a shim at `bin/<name>` that `go run -C $REPO_ROOT ./app-state/<name>`.
3. Append a struct literal to `appConfigurators` in [`deploy/iedora/configurators.go`](../deploy/iedora/configurators.go) — `{name, binary: "bin/<name>"}`.
4. Classify whatever new BWS keys it reads in [`deploy/with-secrets/env.go::secretAllow`](../deploy/with-secrets/env.go) under `stageApp`.
5. Document the recovery path (`(BWS has, service has)` × 4 matrix) in the configurator's own README if it writes one-shot-reveal values back to BWS.

## See also

- **[`docs/deploy.md`](../docs/deploy.md)** § Stage 3 — narrative, including idempotency guarantees + the recovery matrix.
- **[`deploy/iedora/configurators.go`](../deploy/iedora/configurators.go)** — the registry.
