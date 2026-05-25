# `deploy/` — orchestrator + shared helpers

Stage-agnostic tooling that drives the whole pipeline. **Not a stage itself** — the iedora orchestrator and the `with-secrets` env wrapper compose the 4 stages defined elsewhere ([`infra/`](../infra/), [`app-state/`](../app-state/), [`products/`](../products/) for stages 1+4).

## Modules

- [`deploy/iedora/`](iedora/) — Go orchestrator. Subcommands: `iac apply|destroy`, `app apply`, `deploy [products…]`, `destroy [products…]`, `pipeline`, `doctor`. Owns the Stage 3 configurator registry (`configurators.go`) and the Stage 4 productRuntime registry (`products.go` + `runtime_*.go`).
- [`deploy/with-secrets/`](with-secrets/) — BWS env wrapper. `bin/with-secrets [--stage iac|app|deploy] [--product NAME] -- <cmd>`. Filters BWS keys by stage (defence-in-depth) and emits `TF_VAR_*` aliases for Tofu-using stages.

Shared Go helpers live one level up at [`internal/`](../internal/) so app-state binaries can also import them (Go's `internal/` visibility scopes packages to siblings of the parent directory).

## Why these aren't under `infra/`

`infra/` is Stage 2 only. The orchestrator and env wrapper are cross-stage — they run in every stage, including the ones that explicitly aren't infrastructure. Naming the directory after what it does (deploy) is clearer than nesting it under a stage label that doesn't apply.

## See also

- **[`docs/deploy.md`](../docs/deploy.md)** — full pipeline doc.
- **[`infra/CLAUDE.md`](../infra/CLAUDE.md)** — Stage 2 contract.
- **[`app-state/CLAUDE.md`](../app-state/CLAUDE.md)** — Stage 3 contract.
