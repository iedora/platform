output "public_hostname" {
  description = "FQDN routed to kamal-proxy."
  value       = var.public_hostname
}

output "assets_hostname" {
  description = "FQDN routed to the MinIO accessory."
  value       = coalesce(var.assets_hostname, "assets.${join(".", slice(split(".", var.public_hostname), 1, length(split(".", var.public_hostname))))}")
}

output "tunnel_id" {
  description = "Cloudflare Tunnel UUID."
  value       = cloudflare_zero_trust_tunnel_cloudflared.menu.id
}

output "tunnel_token" {
  description = "Connector token for the cloudflared accessory. Goes into .kamal/secrets-common as TUNNEL_TOKEN."
  value       = data.cloudflare_zero_trust_tunnel_cloudflared_token.menu.token
  sensitive   = true
}
