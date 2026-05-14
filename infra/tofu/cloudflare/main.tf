# Cloudflare-managed pieces:
#   - R2 bucket + CORS policy
#   - Cloudflare Tunnel (remotely-managed config) + ingress + DNS CNAME
#
# Deliberately OUT OF SCOPE: R2 S3 access keys.
# As of 2026-01 there is a known bug (cloudflare/terraform-provider-cloudflare#6626)
# where keys produced via cloudflare_api_token return 403 when used as S3
# credentials. Until upstream fixes it, the token is created once via wrangler
# (`scripts/cf-r2-token.sh`) and pasted into .kamal/secrets-common. Tradeoff
# accepted because the rest of the resources here are zero-friction.

# ── R2 bucket + CORS ──────────────────────────────────────────────────────────

resource "cloudflare_r2_bucket" "assets" {
  account_id    = var.account_id
  name          = var.bucket_name
  location      = var.bucket_location
  jurisdiction  = "default" # NOT "eu" — breaks r2_bucket_cors (#5144)
  storage_class = "Standard"
}

resource "cloudflare_r2_bucket_cors" "assets" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.assets.name

  rules = [{
    allowed = {
      origins = ["https://${var.public_hostname}"]
      methods = ["GET", "PUT", "POST", "HEAD"]
      headers = ["*"]
    }
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }]
}

# ── Cloudflare Tunnel ─────────────────────────────────────────────────────────

resource "cloudflare_zero_trust_tunnel_cloudflared" "menu" {
  account_id = var.account_id
  name       = var.tunnel_name
  config_src = "cloudflare" # remotely-managed config (so the ingress block below applies)
}

# Token used by the cloudflared daemon on the origin. Exposed via a data source
# (NOT an attribute on the resource — provider >= 5.8.2).
data "cloudflare_zero_trust_tunnel_cloudflared_token" "menu" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.menu.id
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "menu" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.menu.id

  config = {
    ingress = [
      {
        hostname = var.public_hostname
        service  = var.origin_service
      },
      # Catch-all required by cloudflared — last rule must have no hostname.
      {
        service = "http_status:404"
      },
    ]
  }
}

# ── DNS — CNAME pointing the public hostname at the tunnel ────────────────────

resource "cloudflare_dns_record" "menu" {
  zone_id = var.zone_id
  name    = var.public_hostname
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.menu.id}.cfargotunnel.com"
  ttl     = 1 # 1 = auto; required when proxied = true
  proxied = true
}
