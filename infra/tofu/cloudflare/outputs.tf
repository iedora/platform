output "bucket_name" {
  description = "R2 bucket name — use for S3_BUCKET in Kamal env."
  value       = cloudflare_r2_bucket.assets.name
}

output "s3_endpoint" {
  description = "R2 S3-compatible endpoint — use for S3_ENDPOINT in Kamal env."
  value       = "https://${var.account_id}.r2.cloudflarestorage.com"
}

output "tunnel_id" {
  description = "Cloudflare Tunnel UUID."
  value       = cloudflare_zero_trust_tunnel_cloudflared.menu.id
}

output "tunnel_token" {
  description = "Connector token for the cloudflared daemon. Pass to Ansible via CLOUDFLARED_TUNNEL_TOKEN."
  value       = data.cloudflare_zero_trust_tunnel_cloudflared_token.menu.token
  sensitive   = true
}

output "public_hostname" {
  description = "FQDN the tunnel routes to the origin."
  value       = var.public_hostname
}
