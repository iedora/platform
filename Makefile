.PHONY: help ssh-key ansible-deps \
        onprem-bootstrap onprem-setup \
        hetzner-up hetzner-down hetzner-tofu hetzner-ansible hetzner-ssh \
        cloudflare-up cloudflare-down cloudflare-sync cloudflare-r2-token \
        kamal-bootstrap kamal-deploy kamal-redeploy kamal-rollback kamal-logs kamal-app \
        migrate

# ── Shared ────────────────────────────────────────────────────────────────────
SSH_KEY        ?= $(HOME)/.ssh/id_ed25519
ANSIBLE_DIR    := infra/ansible
TOFU_HETZNER   := infra/tofu/hetzner
TOFU_CF        := infra/tofu/cloudflare

# Env vars instead of ansible.cfg: /mnt/c (WSL) is world-writable and Ansible
# silently ignores cfg files under those conditions. The inventory plugin
# (cloud.terraform) also needs to be whitelisted explicitly.
ANSIBLE_DYNAMIC_ENV := \
  ANSIBLE_HOST_KEY_CHECKING=false \
  ANSIBLE_INVENTORY_ENABLED=cloud.terraform.terraform_provider,host_list,script,auto,yaml,ini,toml \
  ANSIBLE_INVENTORY=./inventory.yml \
  ANSIBLE_PIPELINING=true

ANSIBLE_STATIC_ENV := \
  ANSIBLE_HOST_KEY_CHECKING=false \
  ANSIBLE_INVENTORY=./inventory.onprem.yml \
  ANSIBLE_PIPELINING=true

# Kamal destination — onprem is the default; pass DEST=hetzner to target the VPS.
DEST    ?= onprem
KAMAL   := kamal -d $(DEST)

help:  ## Show this help
	@echo "On-prem (existing Linux box, no Tofu):"
	@echo "  make onprem-bootstrap BOOTSTRAP_USER=pwu  - 1st time: create deploy user + SSH key"
	@echo "  make onprem-setup                         - Full setup (Docker + UFW + cloudflared)"
	@echo "                                              Needs CLOUDFLARED_TUNNEL_TOKEN in env"
	@echo
	@echo "Hetzner (Tofu-provisioned VM):"
	@echo "  make hetzner-up                           - Tofu apply + Ansible playbook"
	@echo "  make hetzner-tofu                         - Tofu apply only"
	@echo "  make hetzner-ansible                      - Ansible playbook only"
	@echo "  make hetzner-down                         - tofu destroy"
	@echo "  make hetzner-ssh                          - SSH into the VM"
	@echo
	@echo "Cloudflare (R2 + Tunnel + DNS — managed by Tofu):"
	@echo "  make cloudflare-up                        - tofu apply + sync outputs into .envrc"
	@echo "  make cloudflare-sync                      - re-write .envrc from current Tofu outputs"
	@echo "  make cloudflare-r2-token                  - prints dashboard steps to create R2 keys"
	@echo "  make cloudflare-down                      - tofu destroy"
	@echo
	@echo "Shared:"
	@echo "  make ssh-key                              - Generate ~/.ssh/id_ed25519 (idempotent)"
	@echo "  make ansible-deps                         - Install Ansible Galaxy collections"
	@echo
	@echo "App deploy (Kamal — DEST=onprem|hetzner, default onprem):"
	@echo "  make kamal-bootstrap [DEST=...]           - 1st time: pre-boot accessories + setup + 1st migration"
	@echo "  make kamal-deploy [DEST=...]              - Zero-downtime deploy (build + push + migrate + roll)"
	@echo "  make kamal-redeploy [DEST=...]            - Redeploy without rebuild"
	@echo "  make kamal-rollback [DEST=...]            - Rollback to previous version"
	@echo "  make kamal-logs [DEST=...]                - Tail logs"
	@echo "  make kamal-app [DEST=...]                 - Shell inside the app container"
	@echo "  make migrate [DEST=...]                   - Escape hatch: run migrations manually"

# ── SSH key ───────────────────────────────────────────────────────────────────
ssh-key: $(SSH_KEY)  ## Generate SSH key if missing
$(SSH_KEY):
	@mkdir -p $(HOME)/.ssh
	@chmod 700 $(HOME)/.ssh
	@echo "Generating SSH key at $(SSH_KEY)..."
	@ssh-keygen -t ed25519 -f $(SSH_KEY) -N "" -C "meta-menu-deploy"

ansible-deps:  ## Install Ansible Galaxy collections
	@cd $(ANSIBLE_DIR) && ansible-galaxy collection install -r requirements.yml >/dev/null

# ── On-prem (no Tofu — host already exists) ───────────────────────────────────
BOOTSTRAP_USER ?= pwu

onprem-bootstrap: ssh-key ansible-deps  ## 1st-time deploy-user creation via $(BOOTSTRAP_USER) + password
	@command -v sshpass >/dev/null 2>&1 || { echo "Install sshpass (apt install sshpass) — required for --ask-pass"; exit 1; }
	cd $(ANSIBLE_DIR) && $(ANSIBLE_STATIC_ENV) ansible-playbook \
	  --limit onprem \
	  -e ansible_user=$(BOOTSTRAP_USER) \
	  --ask-pass --ask-become-pass \
	  bootstrap.yml

onprem-setup: ssh-key ansible-deps  ## Full on-prem setup (Docker + UFW + cloudflared)
	@if [ -z "$$CLOUDFLARED_TUNNEL_TOKEN" ]; then \
	  echo "Note: CLOUDFLARED_TUNNEL_TOKEN not set — the tunnel play will be skipped."; \
	  echo "      To install/update the tunnel: CLOUDFLARED_TUNNEL_TOKEN=eyJ... make onprem-setup"; \
	fi
	cd $(ANSIBLE_DIR) && $(ANSIBLE_STATIC_ENV) ansible-playbook --limit onprem setup.yml

# ── Hetzner (Tofu + Ansible) ──────────────────────────────────────────────────
hetzner-up: hetzner-tofu hetzner-ansible  ## Provision Hetzner VM end-to-end

hetzner-tofu: ssh-key  ## Tofu apply (creates the VM)
	cd $(TOFU_HETZNER) && tofu init -upgrade && tofu apply -auto-approve

hetzner-ansible: ssh-key ansible-deps  ## Ansible setup against the Tofu-provisioned VM
	cd $(ANSIBLE_DIR) && $(ANSIBLE_DYNAMIC_ENV) ansible-playbook --limit hetzner setup.yml

hetzner-down: ssh-key  ## Destroy the Hetzner VM
	cd $(TOFU_HETZNER) && tofu destroy -auto-approve

hetzner-ssh:  ## SSH into the Hetzner VM
	@cd $(TOFU_HETZNER) && ssh -i $(SSH_KEY) deploy@$$(tofu output -raw server_host)

# ── Cloudflare (R2 + Tunnel + DNS) ────────────────────────────────────────────
cloudflare-up: cloudflare-sync  ## tofu apply + write outputs to .envrc

cloudflare-down:  ## Destroy R2 bucket + Tunnel + DNS
	cd $(TOFU_CF) && tofu destroy -auto-approve

cloudflare-sync:  ## (Re-)apply Cloudflare resources and refresh .envrc
	cd $(TOFU_CF) && tofu init -upgrade && tofu apply -auto-approve
	bash scripts/cf-sync.sh

cloudflare-r2-token:  ## Print dashboard instructions for creating an R2 API token
	@bash scripts/cf-r2-token.sh

# ── Kamal ─────────────────────────────────────────────────────────────────────
kamal-bootstrap:  ## 1st-time on a fresh server (pre-boot accessories + setup --skip-hooks + 1st migration)
	DEST=$(DEST) bash scripts/bootstrap.sh

kamal-deploy:  ## Zero-downtime deploy (pre-deploy hook runs migrations)
	$(KAMAL) deploy

kamal-redeploy:  ## Redeploy without rebuilding the image
	$(KAMAL) redeploy

kamal-rollback:  ## Rollback to the previous version
	$(KAMAL) rollback

kamal-logs:  ## Tail logs (-f)
	$(KAMAL) app logs -f

kamal-app:  ## Shell inside the running app container
	$(KAMAL) app exec --interactive --reuse bash

migrate:  ## Run Drizzle migrations against the current image (escape hatch)
	$(KAMAL) app exec --reuse "node scripts/migrate.mjs"
