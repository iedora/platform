variable "hcloud_token" {
  description = "Hetzner Cloud API token (https://console.hetzner.cloud → project → API Tokens). Provide via TF_VAR_hcloud_token."
  type        = string
  sensitive   = true
}

variable "state_passphrase" {
  description = "Passphrase used by OpenTofu state/plan encryption. Provide via TF_VAR_state_passphrase. Keep it in your password manager — losing it = unrecoverable state."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.state_passphrase) >= 16
    error_message = "state_passphrase must be at least 16 characters."
  }
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key uploaded to Hetzner and authorized for the deploy user."
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "ssh_private_key_path" {
  description = "Path to the matching SSH private key (used to wait-for-cloud-init)."
  type        = string
  default     = "~/.ssh/id_ed25519"
}

variable "server_type" {
  description = "Hetzner server type. cx2x = AMD shared, cax* = ARM shared, cpx* = AMD dedicated."
  type        = string
  default     = "cx22" # 2 vCPU, 4 GB RAM, ~€4/mo

  validation {
    condition     = can(regex("^(cx|cax|cpx|ccx)[0-9]+$", var.server_type))
    error_message = "server_type must be a valid Hetzner shape (cx*, cax*, cpx*, ccx*)."
  }
}

variable "location" {
  description = "Hetzner datacenter location."
  type        = string
  default     = "nbg1" # Nuremberg

  validation {
    condition     = contains(["nbg1", "fsn1", "hel1", "ash", "hil", "sin"], var.location)
    error_message = "location must be one of nbg1, fsn1, hel1, ash, hil, sin."
  }
}
