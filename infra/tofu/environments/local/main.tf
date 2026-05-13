terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {}

locals {
  ssh_public_key = trimspace(file(pathexpand(var.ssh_public_key_path)))
  docker_context = "${path.module}/../../../docker"
}

resource "docker_image" "server" {
  name         = "meta-menu-server-base:latest"
  keep_locally = true

  build {
    context    = local.docker_context
    dockerfile = "Dockerfile.server"
    build_args = {
      DEPLOY_USER = var.deploy_user
    }
  }
}

resource "docker_container" "server" {
  name    = var.vm_name
  image   = docker_image.server.image_id
  restart = "unless-stopped"

  # Privileged necessário para Docker-in-Docker (Kamal instala Docker no servidor)
  privileged = true

  ports {
    internal = 22
    external = var.ssh_port
  }

  memory = var.memory_gb * 1024

  upload {
    content = "${local.ssh_public_key}\n"
    file    = "/home/${var.deploy_user}/.ssh/authorized_keys"
  }
}
