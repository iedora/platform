variable "vm_name" {
  type    = string
  default = "meta-menu-server"
}

variable "deploy_user" {
  type    = string
  default = "deploy"
}

variable "ssh_public_key_path" {
  type    = string
  default = "~/.ssh/id_ed25519.pub"
}

variable "ssh_private_key_path" {
  type    = string
  default = "~/.ssh/id_ed25519"
}

variable "hcloud_token" {
  type      = string
  sensitive = true
}

variable "server_type" {
  type    = string
  default = "cx22" # 2 vCPU, 4GB RAM, ~€4/mês
}

variable "location" {
  type    = string
  default = "nbg1" # Nuremberg
}

variable "timezone" {
  type    = string
  default = "Europe/Lisbon"
}
