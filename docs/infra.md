# Infra — provisioning the homelab box

> One-line purpose: edit one file, run one command, deploy the app to a homelab box behind a Cloudflare Tunnel.
> **Last updated:** 2026.

> **TL;DR** — one config file (`infra/.env`), one entry point (`make deploy` → `bash infra/deploy.sh`). The script does Tofu, host bootstrap, and Kamal in order. Idempotent — same command for first-deploy and subsequent deploys.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│  Cloudflare (OpenTofu — one tunnel, two ingress rules)                 │
│   ─ menu.<domain>     → http://kamal-proxy                             │
│   ─ assets.<domain>   → http://meta-menu-minio:9000                    │
│  Both target Docker container names on the Kamal network.              │
├────────────────────────────────────────────────────────────────────────┤
│  Server (bash, on first run only)                                      │
│   ─ create `deploy` user + sudoers + SSH key                           │
│   ─ disable root login + password auth                                 │
│  Docker is installed by `kamal server bootstrap`.                      │
├────────────────────────────────────────────────────────────────────────┤
│  App (Kamal 2)                                                         │
│   App + proxy + 4 accessories (postgres, redis, minio, cloudflared)    │
│   on a shared `kamal` Docker network — no host ports published.        │
└────────────────────────────────────────────────────────────────────────┘
```

## Layout

```
infra/
  .env.example              copy to .env, fill in 6 required values
  deploy.sh                 the one entry point — invoked by `make deploy`
  tofu/                     Cloudflare tunnel + DNS + ingress (encrypted state)
  kamal/
    config/deploy.yml       app + 4 accessories incl cloudflared
    .kamal/hooks/pre-deploy Drizzle migrations under pg_advisory_lock
scripts/
  host-init.sh              deploy user + SSH key + sshd hardening (called by deploy.sh first time)
  kamal-first-deploy.sh     Kamal first-deploy ordering (called by deploy.sh first time)
  k.sh                      kamal wrapper used by `make logs/console/...`
  migrate.mjs               Drizzle migrations
```

## Prerequisites

- Cloudflare account + zone you control.
- API token: Account · Cloudflare Tunnel · Edit, Zone · DNS · Edit (scoped), Account · Account Settings · Read.
- Linux box (Ubuntu 24.04+) with an existing sudo user.
- Mac tools: `brew install opentofu` + `sudo gem install kamal -N` (Ruby gem), Docker running, `gh` CLI logged in.
- SSH key on the box: `ssh-copy-id <user>@<box>` (paste password once).

## One command

```bash
cp infra/.env.example infra/.env
$EDITOR infra/.env                # fill in 6 required values
make deploy                       # everything else, automated
```

`infra/deploy.sh` walks through six steps:
1. **Load** `infra/.env`.
2. **Generate** any blank secrets (`STATE_PASSPHRASE`, `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`) and save back to `.env`.
3. **`tofu apply`** — create or update Cloudflare tunnel + DNS + ingress.
4. **Write** `infra/kamal/.kamal/secrets-common` from the env.
5. **Host-init** — only on first run (skipped when `deploy@$ONPREM_HOST` already accepts your key).
6. **Kamal** — `kamal-first-deploy.sh` on first run (workaround for basecamp/kamal#526), `kamal deploy` on every subsequent run.

Re-running `make deploy` is the reproducibility test — pulls in any config drift, redeploys cleanly.

## Day-2 ops

```bash
make logs            # tail app logs
make console         # bash inside the app container
make redeploy
make rollback
make migrate
make destroy         # tofu destroy: removes tunnel + DNS only
```

All wrap `kamal` via `scripts/k.sh` which loads `infra/.env` — no manual `source` needed.

## Why container-name ingress

In Kamal 2, app + proxy + accessories share the `kamal` Docker network and resolve each other by container name. cloudflared runs as an accessory on that same network, so it reaches `kamal-proxy` and `meta-menu-minio` directly — no host port publishing, no UFW rules, no NAT gotchas (basecamp/kamal#1790).

## Why no Ansible

Kamal 2 installs Docker on its own via `kamal server bootstrap`; cloudflared runs as a Docker container instead of an apt + systemd service. That removes 200+ lines of Ansible YAML, Galaxy deps, and Python on the controller. Host-init is ~50 lines of bash: deploy user + SSH key + sshd hardening. Run once, never again.

## Troubleshooting

**`make deploy` says "missing in infra/.env"** — fill in the named field, re-run.

**`tofu apply` errors "encryption configuration missing"** — `STATE_PASSPHRASE` in `.env` is blank. Re-run `make deploy` — the script auto-generates it. Already-existing state requires the original passphrase; if lost, `make destroy` + start fresh.

**`cloudflared` accessory restart loop** — stale `TUNNEL_TOKEN`. Delete `infra/kamal/.kamal/secrets-common` and re-run `make deploy`.

**502 from the tunnel** — `docker network inspect kamal` on the box should show kamal-proxy + 4 accessories + the app. If something's missing, `make logs` for that container.

**Sudo password rejected during host-init** — `BOOTSTRAP_USER` isn't in the `sudo` group, or the password in `.env` is wrong. Test: `ssh <user>@<box> 'sudo -v'`.
