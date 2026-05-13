output "server_host" {
  value = hcloud_server.server.ipv4_address
}

output "server_port" {
  value = 22
}

output "ssh_command" {
  value = "ssh ${var.deploy_user}@${hcloud_server.server.ipv4_address}"
}
