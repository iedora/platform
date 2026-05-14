terraform {
  required_version = "~> 1.10"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.48"
    }
    ansible = {
      source  = "ansible/ansible"
      version = "~> 1.3"
    }
  }

  # State and plan encryption (OpenTofu 1.7+). Passphrase comes from
  # TF_VAR_state_passphrase so it never lands in the repo. With local state,
  # this is the only thing protecting Hetzner tokens / SSH metadata at rest
  # — laptop theft or accidental `git add tfstate` would otherwise leak them.
  #
  # Migrating an existing unencrypted state? Wrap with `fallback {}` for ONE
  # apply, then remove it. New projects: leave `enforced = true`.
  encryption {
    key_provider "pbkdf2" "default" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "default" {
      keys = key_provider.pbkdf2.default
    }
    state {
      method   = method.aes_gcm.default
      enforced = true
    }
    plan {
      method   = method.aes_gcm.default
      enforced = true
    }
  }
}
