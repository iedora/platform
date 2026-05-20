output "data_bucket_name" {
  description = "Name of the shared private R2 bucket (backups, future internal datasets — prefix-namespaced)."
  value       = cloudflare_r2_bucket.data.name
}

output "assets_bucket_name" {
  description = "Name of the shared public R2 bucket. Custom domain at var.assets_hostname."
  value       = cloudflare_r2_bucket.assets.name
}

output "assets_public_url" {
  description = "Base URL the assets bucket is served from (CF custom domain)."
  value       = "https://${var.assets_hostname}"
}

# ── Hetzner outputs ──────────────────────────────────────────────────────────
# IPv4 is the source of truth for: the docker provider host, the
# zitadel-rebootstrap SSH commands, and the A records pointed at the box.

output "hetzner_ipv4" {
  description = "Public IPv4 of the Hetzner CAX11 box. A records + SSH targets resolve here."
  value       = hcloud_server.iedora.ipv4_address
}

output "hetzner_ipv6" {
  description = "Public IPv6 of the Hetzner box. Useful for AAAA records once we're ready to dual-stack."
  value       = hcloud_server.iedora.ipv6_address
}
