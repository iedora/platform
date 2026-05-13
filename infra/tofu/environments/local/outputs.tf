output "server_host" {
  value = "localhost"
}

output "server_port" {
  value = var.ssh_port
}

output "ssh_command" {
  value = "ssh -p ${var.ssh_port} ${var.deploy_user}@localhost"
}
