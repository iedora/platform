.PHONY: help deploy logs console rollback redeploy migrate destroy

help:  ## Show this help
	@echo "One-time setup:"
	@echo "  cp infra/.env.example infra/.env   - fill in Cloudflare + box values"
	@echo "  ssh-copy-id <user>@<box>           - install your SSH key on the box"
	@echo
	@echo "Deploy:"
	@echo "  make deploy                        - end-to-end: tunnel + host-init + first/regular deploy"
	@echo
	@echo "Day-to-day:"
	@echo "  make logs                          - tail app logs"
	@echo "  make console                       - bash inside the app container"
	@echo "  make redeploy                      - re-pull current image, no rebuild"
	@echo "  make rollback                      - rollback to previous version"
	@echo "  make migrate                       - run migrations against current image"
	@echo
	@echo "Teardown:"
	@echo "  make destroy                       - tofu destroy (tunnel + DNS only — does not touch the box)"

deploy:  ## End-to-end: tofu apply → write secrets → host-init (if needed) → kamal deploy
	@bash infra/deploy.sh

logs:      ; @bash scripts/k.sh logs
console:   ; @bash scripts/k.sh console
redeploy:  ; @bash scripts/k.sh redeploy
rollback:  ; @bash scripts/k.sh rollback
migrate:   ; @bash scripts/k.sh migrate

destroy:  ## Destroy the Cloudflare tunnel + DNS (does NOT touch the box)
	@cd infra/tofu && tofu destroy -auto-approve
