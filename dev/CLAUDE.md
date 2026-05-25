# `dev/` — local development stack

Mirror of the production pipeline against local Docker + LocalStack. Boots Postgres, Zitadel, OpenObserve, and (optionally) a menu container via host-published ports. Independent from production credentials and BWS — uses dev-only fixtures.

## Layout

- [`dev/orchestrator/`](orchestrator/) — Go binary (`task dev`, `task dev:down`, `task dev:reset-db -- <svc>`). Drives the dev tofu root + the Stage-3-equivalent seed step.
- [`dev/tofu/`](tofu/) — Tofu root that boots the dev containers via the local Docker daemon. State stays on the operator's machine (unencrypted, never committed).
- `dev/.zitadel-bootstrap/` — local Zitadel's FirstInstance outputs (SA key, PAT). Gitignored. Recreated on every `task dev` cold start.

## How it differs from prod

- **No SSH** — Docker is local.
- **No Caddy** — services publish ports directly (`localhost:5432` postgres, `localhost:8080` zitadel, `localhost:5080` openobserve).
- **No BWS** — `bin/zitadel-apply --no-bws --output-file <path>` writes Zitadel outputs to a JSON file the dev orchestrator composes into `.env.local`.
- **Same Stage 3 binaries** — [`app-state/zitadel/`](../app-state/zitadel/) reconciles against the local Zitadel exactly like it does against prod.

## See also

- **[`docs/deploy.md`](../docs/deploy.md)** § Local dev stack — operator commands + flow.
