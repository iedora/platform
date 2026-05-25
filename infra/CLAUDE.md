# Stage 2 — `infra/`

Infrastructure-as-code only. One Tofu root provisions the Hetzner VPS, every Cloudflare resource, the GitHub Actions config, and every **shared** Docker container on the box. Stage-3 configurators (Zitadel app config, DB migrations, OpenObserve dashboards) and Stage-4 product deploys live elsewhere — see [`app-state/`](../app-state/) and [`deploy/iedora/runtime_*.go`](../deploy/iedora/).

## What this owns

**Tofu state ([`infra/tofu/`](tofu/)):**

- **Hetzner VPS** (`hetzner.tf`) — `hcloud_server.iedora` (CX23, Falkenstein, x86_64) + SSH key + firewall.
- **Cloudflare resources** (`main.tf`) — R2 buckets, scoped tokens, DNS records for `menu.iedora.com` / `auth.iedora.com` / `obs.iedora.com` / `assets.iedora.com` (all grey-cloud A records pointing directly at the VPS IPv4; Caddy terminates TLS on-box).
- **GitHub Actions config** (`github.tf`) — `github_actions_secret.secrets[*]` + `github_actions_variable.vars[*]`, `for_each` over a locals map; values flow from BWS via `TF_VAR_*` aliases.

**Tofu-managed SHARED containers** (`containers.tf`) — every always-on Docker container on the VPS via `kreuzwerker/docker` over SSH:

- `infra-postgres` — Postgres 18, shared by menu + zitadel databases. Boots from [`postgres/init.sql`](postgres/init.sql) (CREATE DATABASE menu / zitadel) which is `path.module/../postgres/init.sql` away.
- `infra-backups` — daily `pg_dumpall` → R2, GPG-encrypted. Image built from [`backup/`](backup/).
- `infra-openobserve` — OTLP receiver + UI on `127.0.0.1:5080`, R2 cold tier.
- `infra-zitadel` + `infra-zitadel-login` — the IdP runtime (Stage 3 reconciles its app-level state).
- `infra-caddy` — TLS termination + reverse proxy, bound to the VPS public IPv4.

The menu app (`infra-menu-web`) is **not** here — it's owned by Stage 4 (`task deploy:menu`) via the `dockerOnHetzner` productRuntime. Caddy routes to it by network alias; the container can come and go between deploys without touching Tofu.

## Hard rules

1. **Declarative-first.** Every resource here is Tofu-managed. **Edit `.tf` files, never the upstream UI** — `task up` will silently clobber UI edits.
2. **Tofu-managed credentials write through to BWS** as `IAC_*` (`secrets.tf::terraform_data.bws_sync_autogen` → `bin/bws-upsert`). Editing BWS directly is wasted work; the next apply restores Tofu's value.
3. **Bootstrap order is BWS → Tofu → write-through.** Operator pastes the `IAC_BOOTSTRAP_*` keys first; everything else is Tofu-minted.
4. **Follow [`docs/terraform-style.md`](../docs/terraform-style.md)** when editing any `.tf` — pessimistic `~>` pins, `for_each` over `count`, `validation` blocks.
5. **State file is encrypted in git.** PBKDF2 + AES-GCM, passphrase from `IAC_BOOTSTRAP_STATE_PASSPHRASE`. Rotation via the `fallback` block migration — see [`docs/deploy.md`](../docs/deploy.md) § Secret rotation.
6. **Run the pre-merge runbook on every deploy-shape change** — see [`docs/deploy.md`](../docs/deploy.md) § Pre-merge runbook.

## Stage 2 file layout

```
infra/
  tofu/                                 single encrypted Tofu root
    versions.tf                         hcloud, cloudflare ~> 5.19, github ~> 6.12, kreuzwerker/docker ~> 3.7
    variables.tf                        bootstrap creds + GH config + hostnames + container secrets
    hetzner.tf                          hcloud_server.iedora + firewall + SSH key
    main.tf                             R2 buckets + DNS (menu/auth/obs/assets)
    containers.tf                       docker_network.iedora + docker_volume.zitadel_bootstrap +
                                        every SHARED docker_container
    secrets.tf                          random_password.* + IAC_* BWS write-through
    github.tf                           Tofu-managed GH Actions secrets + variables
    outputs.tf                          hetzner_ipv4 + menu_* env outputs for Stage 4
  modules/services/                     Tofu sub-modules (postgres, openobserve, zitadel, …)
  postgres/init.sql                     CREATE DATABASE menu / zitadel (runs on first container boot)
  backup/                               self-built Postgres-backup image (Dockerfile, run.sh, backup.sh, restore.sh)
  bws-upsert/                           Go helper invoked by terraform_data.bws_sync_autogen (Stage 2 only)
```

## See also

- **[`docs/deploy.md`](../docs/deploy.md)** — full pipeline doc (all 4 stages, CI, failure modes, secret rotation, day-2 ops).
- **[`docs/terraform-style.md`](../docs/terraform-style.md)** — LLM-safe HCL conventions.
- **[`app-state/`](../app-state/)** — Stage 3 configurators (Zitadel, DB migrations, OO dashboards).
- **[`deploy/iedora/`](../deploy/iedora/)** — orchestrator that walks every stage.
