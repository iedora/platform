.PHONY: up down recreate tofu ansible ssh help

TOFU_DIR    := infra/tofu/environments/local
ANSIBLE_DIR := infra/ansible

help:  ## Mostra esta ajuda
	@echo "Comandos disponíveis:"
	@echo "  make up        - Provisiona servidor local (Tofu + Ansible)"
	@echo "  make down      - Destrói servidor local"
	@echo "  make recreate  - Destrói e recria do zero"
	@echo "  make tofu      - Apenas Tofu apply"
	@echo "  make ansible   - Apenas Ansible playbook"
	@echo "  make ssh       - SSH para o servidor"

up: tofu ansible  ## Provisiona servidor local completo

down:  ## Destrói servidor local
	cd $(TOFU_DIR) && tofu destroy -auto-approve

recreate: down up  ## Destrói e recria do zero

tofu:  ## Aplica configuração Tofu
	cd $(TOFU_DIR) && tofu init -upgrade && tofu apply -auto-approve

ansible:  ## Corre playbook Ansible
	cd $(ANSIBLE_DIR) && ANSIBLE_HOST_KEY_CHECKING=false ansible-playbook setup.yml -i inventory/local.ini

ssh:  ## SSH para o servidor local
	ssh -p 2222 -i ~/.ssh/id_ed25519 deploy@localhost
