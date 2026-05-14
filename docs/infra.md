# Infra — provisioning servers

> One-line purpose: get a Linux box (on-prem or Hetzner) into a state where `make kamal-deploy` works against it.
> **Last updated:** 2026.

> **TL;DR** — two deployment paths, one Ansible playbook does both:
> - **on-prem**: an existing Ubuntu box on your LAN, reached via Cloudflare Tunnel (no Tofu, no public IP).
> - **hetzner**: a Hetzner Cloud VM provisioned by OpenTofu, public IP, kamal-proxy handles TLS.

The Docker-in-Docker "local" simulation that previous versions of this repo carried was removed in 2026 — if you want a real-system rehearsal, point on-prem at any Linux box (your own laptop included).

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 1 — Provisioning                                              │
│   on-prem  → host already exists (no Tofu)                           │
│   hetzner  → OpenTofu (hcloud provider) creates the VM               │
├──────────────────────────────────────────────────────────────────────┤
│  Layer 2 — Configuration (Ansible)                                   │
│   single playbook (setup.yml) — base / metal / onprem plays          │
│   FQCN-only, deb822 apt repos, hardened cloudflared systemd unit     │
├──────────────────────────────────────────────────────────────────────┤
│  Layer 3 — App deploy (Kamal) — see deploy.md                        │
│   zero-downtime, rollback, destinations (-d onprem | -d hetzner)     │
└──────────────────────────────────────────────────────────────────────┘
```

## Layout

```
infra/
  shared/vars.yml             shared by Tofu and Ansible (deploy_user, vm_name, timezone, …)
  tofu/hetzner/               flat layout — only Tofu env right now
    main.tf                   hcloud_server + ansible_host + terraform_data (cloud-init wait)
    variables.tf              with validation blocks
    versions.tf               required_version + provider pins + state encryption block
    outputs.tf
    terraform.tfvars.example  template
  ansible/
    inventory.yml             DYNAMIC inventory (cloud.terraform plugin reads tofu state)
    inventory.onprem.yml      STATIC inventory for hosts not under Tofu
    bootstrap.yml             one-shot: create deploy user + SSH key on a fresh on-prem box
    setup.yml                 main playbook — base / metal / onprem plays
    requirements.yml          cloud.terraform, community.general, ansible.posix
scripts/
  bootstrap.sh                first-time Kamal bootstrap (pre-boot accessories + setup --skip-hooks)
  migrate.mjs                 Drizzle migrations under pg_advisory_lock (safe for parallel deploys)
```

The dynamic inventory uses `cloud.terraform.terraform_provider` — no `local.ini` / `prod.ini` files. The Hetzner host appears in the `hetzner` group automatically via the `ansible_host` resource in `main.tf`. On-prem hosts live in `inventory.onprem.yml` (`onprem` group, also added to `servers` + `metal`).

## On-prem (existing Linux box)

Prereqs (on your dev machine):
- `ansible` (`apt install ansible` / `brew install ansible`)
- `sshpass` (only for the bootstrap step — `apt install sshpass` / `brew install sshpass`)
- SSH key at `~/.ssh/id_ed25519` (`make ssh-key` generates if absent)

Prereqs (on the target box):
- Ubuntu 24.04 LTS (24.04 minimum; 26.04 works too)
- An existing sudo-capable user with password login (e.g. `pwu`, `ubuntu`)
- SSH service running on port 22

### Bootstrap (first time only — one shot)

Connects as your existing sudo user with password, creates `deploy`, installs your SSH key, grants NOPASSWD sudo. Idempotent.

```bash
make onprem-bootstrap BOOTSTRAP_USER=pwu
# (prompts twice: SSH password + sudo password)
```

### Full setup (Docker + UFW + cloudflared)

Connects as `deploy` over SSH key. Re-runnable — only applies what changed.

```bash
export CLOUDFLARED_TUNNEL_TOKEN=eyJ...    # if you want the tunnel set up
make onprem-setup
```

If `CLOUDFLARED_TUNNEL_TOKEN` is empty the cloudflared play is skipped (`meta: end_host`). You can provision the host first and add the tunnel later by re-running with the env var set.

### Adding another on-prem server

Open `infra/ansible/inventory.onprem.yml`, copy a host block, change `ansible_host`. Each host gets its own Cloudflare Tunnel (one tunnel = one token), but they all share `inventory.onprem.yml`. The playbook is the same.

## Hetzner (Tofu-provisioned VM)

Prereqs:
- Tofu CLI (`brew install opentofu` / `curl ... get.opentofu.org/install-opentofu.sh`)
- Hetzner Cloud project + API token
- `TF_VAR_hcloud_token` and `TF_VAR_state_passphrase` (≥ 16 chars) exported in env

### Provision

```bash
export TF_VAR_hcloud_token=...
export TF_VAR_state_passphrase=...  # store in your password manager — losing it = unrecoverable state
make hetzner-up
```

Steps run end-to-end: `tofu init && tofu apply` creates the VM and writes encrypted state (PBKDF2 + AES-GCM), `terraform_data.wait_for_cloud_init` blocks until cloud-init finishes on the box, then Ansible runs `setup.yml` against the host (discovered via `ansible_host` in the dynamic inventory).

### Useful commands

```bash
make hetzner-tofu       # Tofu apply only
make hetzner-ansible    # Ansible playbook only
make hetzner-ssh        # SSH into the VM (uses the tofu output for the IP)
make hetzner-down       # tofu destroy
```

### Editing config

`infra/tofu/hetzner/variables.tf` validates `server_type` and `location`. `infra/tofu/hetzner/terraform.tfvars.example` shows non-secret defaults. Prefer `TF_VAR_*` env vars over a `terraform.tfvars` file — even with state encryption, tfvars files end up in shell history and editor caches.

## Design choices

- **OpenTofu 1.10+** (`required_version = "~> 1.10"`). State + plan encryption enabled (`enforced = true`) — local state is the default; encrypted-at-rest matters when laptops walk.
- **`terraform_data`** replaces `null_resource` (built-in since OpenTofu 1.0 / Terraform 1.4; community guides recommend it since 2025).
- **`cloud-init status --wait`** instead of "SSH accepts a TCP connection" — the proper ready-signal on Hetzner.
- **FQCN everywhere in Ansible** (`ansible.builtin.apt`, `community.general.ufw`, …). `ansible-lint`'s `fqcn` rule fails on short forms.
- **`deb822_repository`** replaces the deprecated `apt_key` + `apt_repository` pair. Cleaner: GPG key scoped to one source file, not trusted system-wide.
- **`cloudflared --token-file`** (cloudflared 2025.4.0+) instead of `--token` or `TUNNEL_TOKEN` env — token never appears in `ps`, env file only carries the path. Service runs as a dedicated `cloudflared` user with a hardened systemd unit (`NoNewPrivileges`, `ProtectSystem=strict`, `CapabilityBoundingSet=`, …).
- **State stays local** (no remote backend). For team workflows or CI, migrate to S3 or HCP. With ≥1 collaborator, locking matters; OpenTofu 1.10+ supports native S3 state locking via `use_lockfile = true` (no DynamoDB).

## Troubleshooting

**`tofu init` fails after pulling new versions of versions.tf.** Provider versions changed — delete `.terraform/` and re-init. `.terraform.lock.hcl` regenerates on the next init.

**`cloudflared.service` stuck in `activating (auto-restart)`.** Token wrong, or systemd can't read `/etc/cloudflared/token`. `journalctl -u cloudflared -n 50` shows the cause. Re-run `CLOUDFLARED_TUNNEL_TOKEN=... make onprem-setup` to replace the token.

**Ansible fails with "Host key verification failed" on Hetzner.** First boot after re-provision — the host key changed. The inventory already disables host-key checking (`StrictHostKeyChecking=no`). If it still complains, `ssh-keygen -R <ip>` once locally.

**`tofu apply` errors with "encryption configuration missing".** You set `enforced = true` and started without a passphrase. Export `TF_VAR_state_passphrase` (≥ 16 chars) and retry.

**Migrating from unencrypted state to encrypted state.** Add a `fallback {}` block to the `encryption` block in `versions.tf` for ONE apply (the docs walk through it). Re-apply, then remove the fallback. Don't lose the passphrase between those two applies.
