# Cloudflare Zero Trust Tunnel — replaces the on-box Caddy reverse-
# proxy + LE TLS plumbing.
#
# How it works:
#
#   browser → CF edge (TLS termination, universal cert covers
#                       *.iedora.com automatically) → cloudflared
#               sidecar on the Hetzner box (outbound persistent
#               connection to CF) → Docker DNS resolves the target
#               container by name on the iedora network.
#
# What this gets us:
#
#   - No port 80/443 inbound on the firewall. The box is only
#     reachable on port 22 (SSH).
#   - Zero ACME state on the box — no LE rate limits, no caddy-data
#     volume, no DNS-01 plugin, no custom Caddy build.
#   - All routing config lives in Tofu (this file) — visible in `tofu
#     plan` diffs, version-controlled, easy to add a 5th hostname.
#
# The cloudflared container itself lives in compose.tf::services
# .cloudflared. It reads the tunnel token from BWS via the
# `IAC_TUNNEL_TOKEN` key the autogen sync writes (Tofu mints the
# tunnel, exports the token, bws-sync persists it; cloudflared
# consumes it on every restart).

resource "cloudflare_zero_trust_tunnel_cloudflared" "iedora" {
  account_id    = var.account_id
  name          = "iedora"
  config_src    = "cloudflare" # config managed via the resource below, not local cloudflared.yml
  tunnel_secret = base64encode(random_password.tunnel_secret.result)
}

# 32-byte random for the tunnel-secret. Stable across applies (lifecycle
# prevent_destroy off — rotating it just forces a tunnel + DNS recreate
# which is fine for an iedora-scale estate).
resource "random_password" "tunnel_secret" {
  length  = 32
  special = false
}

# Ingress rules — every public hostname pinned to its in-network
# container. The path matcher on /ui/v2/* mirrors the previous
# Caddyfile @login handler.
resource "cloudflare_zero_trust_tunnel_cloudflared_config" "iedora" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.iedora.id
  config = {
    ingress = [
      # ── menu.iedora.com ───────────────────────────────────────
      {
        hostname = var.menu_public_hostname
        service  = "http://infra-menu-web:3000"
      },
      # ── core.iedora.com ───────────────────────────────────────
      # Same upstream as menu; proxy.ts rewrites under /core/* and
      # gates direct visits to /core/* on other hosts (404).
      {
        hostname = "core.${var.zone_name}"
        service  = "http://infra-menu-web:3000"
      },
      # ── iedora.com (apex + www) ───────────────────────────────
      # Both go to the menu container; proxy.ts rewrites apex requests
      # under /house/* internally.
      {
        hostname = var.zone_name
        service  = "http://infra-menu-web:3000"
      },
      {
        hostname = "www.${var.zone_name}"
        service  = "http://infra-menu-web:3000"
      },
      # Catch-all — required by CF Tunnel.
      {
        service = "http_status:404"
      },
    ]
  }
}

# Connector token for the cloudflared container. Sensitive — flows
# through compose.tf as the TUNNEL_TOKEN env var. Exposed via BWS
# (the bws_sync resource in secrets.tf) so the operator can recover
# without a fresh tofu apply.
data "cloudflare_zero_trust_tunnel_cloudflared_token" "iedora" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.iedora.id
}
