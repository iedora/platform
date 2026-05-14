# Template — copy to envs/<name>.tfvars (gitignored) per environment:
#   cp envs/example.tfvars envs/prod.tfvars
#   cp envs/example.tfvars envs/staging.tfvars
#
# Or use `make cf-new-env NAME=prod HOSTNAME=menu.example.com` to scaffold
# both this file and the matching Tofu workspace in one go.
#
# Naming: <name> must match the Tofu workspace AND the suffix on .envrc.<name>
# AND any Kamal destination you wire to it.

# Cloudflare account ID — top-right of dash.cloudflare.com (32 hex chars).
account_id = "00000000000000000000000000000000"

# Zone ID for the domain the tunnel will route. dash → domain → API (right column).
zone_id = "00000000000000000000000000000000"

# The FQDN visitors hit (subdomain of the zone above).
public_hostname = "menu.example.com"

# R2 bucket name. Must be unique within the account.
bucket_name     = "metamenu"
bucket_location = "WEUR" # EEUR, WEUR, ENAM, WNAM, APAC, OC

# Tunnel name shown in the Zero Trust dashboard. Must be unique within the account.
tunnel_name = "meta-menu"

# Where cloudflared forwards traffic on the origin. kamal-proxy listens on :80.
origin_service = "http://localhost:80"

# Secrets — set as TF_VAR_* env vars, never in this file:
#   export TF_VAR_cloudflare_api_token=...
#   export TF_VAR_state_passphrase=...    (≥ 16 chars)
