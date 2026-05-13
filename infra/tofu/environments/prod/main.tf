terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.0"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

locals {
  ssh_public_key  = trimspace(file(pathexpand(var.ssh_public_key_path)))
  ssh_private_key = file(pathexpand(var.ssh_private_key_path))
}

resource "hcloud_ssh_key" "deploy" {
  name       = "${var.vm_name}-deploy"
  public_key = local.ssh_public_key
}

resource "hcloud_server" "server" {
  name        = var.vm_name
  image       = "ubuntu-24.04"
  server_type = var.server_type
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.deploy.id]

  user_data = <<-EOT
    #cloud-config
    timezone: ${var.timezone}
    users:
      - name: ${var.deploy_user}
        groups: [sudo]
        shell: /bin/bash
        sudo: ALL=(ALL) NOPASSWD:ALL
        lock_passwd: true
        ssh_authorized_keys:
          - ${local.ssh_public_key}
    packages: [curl, git, ufw]
    runcmd:
      - ufw allow OpenSSH
      - ufw --force enable
  EOT
}

resource "null_resource" "wait_for_ssh" {
  depends_on = [hcloud_server.server]

  connection {
    type        = "ssh"
    user        = var.deploy_user
    private_key = local.ssh_private_key
    host        = hcloud_server.server.ipv4_address
    timeout     = "120s"
  }

  provisioner "remote-exec" {
    inline = ["echo 'SSH ready'"]
  }
}
