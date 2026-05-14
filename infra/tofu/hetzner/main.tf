provider "hcloud" {
  token = var.hcloud_token
}

provider "ansible" {}

locals {
  shared         = yamldecode(file("${path.module}/../../shared/vars.yml"))
  ssh_public_key = trimspace(file(pathexpand(var.ssh_public_key_path)))
}

resource "hcloud_ssh_key" "deploy" {
  name       = "${local.shared.vm_name}-deploy"
  public_key = local.ssh_public_key
}

resource "hcloud_server" "server" {
  name        = local.shared.vm_name
  image       = "ubuntu-24.04"
  server_type = var.server_type
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.deploy.id]

  # Minimal cloud-init: creates the deploy user with the SSH key.
  # Everything else (packages, Docker, UFW) lives in Ansible — single source of truth.
  user_data = <<-EOT
    #cloud-config
    users:
      - name: ${local.shared.deploy_user}
        groups: [sudo]
        shell: /bin/bash
        sudo: ALL=(ALL) NOPASSWD:ALL
        lock_passwd: true
        ssh_authorized_keys:
          - ${local.ssh_public_key}
  EOT
}

# Block until cloud-init finishes (not just "SSH accepts a TCP connection").
# terraform_data replaces null_resource — built-in, no extra provider needed.
resource "terraform_data" "wait_for_cloud_init" {
  triggers_replace = [hcloud_server.server.id]

  connection {
    type        = "ssh"
    host        = hcloud_server.server.ipv4_address
    user        = local.shared.deploy_user
    private_key = file(pathexpand(var.ssh_private_key_path))
    timeout     = "5m"
  }

  provisioner "remote-exec" {
    inline = ["cloud-init status --wait"]
  }
}

# Declare the host for the dynamic Ansible inventory (cloud.terraform plugin).
resource "ansible_host" "server" {
  name   = local.shared.vm_name
  groups = ["servers", "metal", "hetzner"]

  variables = {
    ansible_host                 = hcloud_server.server.ipv4_address
    ansible_port                 = "22"
    ansible_user                 = local.shared.deploy_user
    ansible_ssh_private_key_file = var.ssh_private_key_path
    ansible_ssh_common_args      = "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
  }

  depends_on = [terraform_data.wait_for_cloud_init]
}
