# Day-2 compose delivery.
#
# Hash-triggered single SSH session. When `local.compose_yaml` changes,
# this resource fires once: scp the new compose file to /etc/iedora/,
# then `systemctl reload iedora.service` which re-runs
# `docker compose up -d --remove-orphans` (idempotent, reconciles drift).
#
# The CF Tunnel config is managed via the Cloudflare API (tunnel.tf), not
# a file on the box — no scp needed. cloud-init + systemd templates are
# also pushed here.
#
# This is the ONLY SSH on Tofu's apply graph. Default parallelism is
# safe — there's no fan-out, no MaxStartups concern, no host-key dance.

resource "terraform_data" "iedora_sync" {
  triggers_replace = {
    server_id    = hcloud_server.iedora.id
    compose      = sha256(local.compose_yaml)
    systemd_unit = sha256(local.systemd_unit)
  }

  connection {
    type        = "ssh"
    host        = hcloud_server.iedora.ipv4_address
    user        = "root"
    private_key = var.infra_ssh_private_key
    timeout     = "10m"
  }

  # Wait for cloud-init to finish on a fresh box. No-op on a warm box
  # (returns immediately if cloud-init is already in "done" state).
  provisioner "remote-exec" {
    inline = [
      "cloud-init status --wait >/dev/null",
      "install -d -m 0755 /etc/iedora /etc/iedora/postgres-init",
    ]
  }

  provisioner "file" {
    content     = local.compose_yaml
    destination = "/etc/iedora/docker-compose.yml"
  }

  provisioner "file" {
    content     = local.systemd_unit
    destination = "/etc/systemd/system/iedora.service"
  }

  # Reconcile.
  #   - `daemon-reload` picks up any change to the unit file.
  #   - `reload` runs ExecReload = `docker compose up -d --remove-
  #     orphans` — only containers whose config changed get recreated.
  #     `restart` would Stop+Start the whole stack via ExecStop=
  #     docker compose down, taking postgres + openobserve down for no
  #     reason.
  #   - `|| start` covers the case where the service isn't yet active
  #     (a fresh-box first apply where cloud-init beat us to it leaves
  #     it active, but a crashed/disabled box may not).
  provisioner "remote-exec" {
    inline = [
      "systemctl daemon-reload",
      # On failure, dump the unit's journal to the provisioner output
      # so the GHA log shows what `docker compose up -d` rejected
      # (image pull, port collision, missing env, …) without an extra
      # SSH round-trip. The trailing `exit 1` preserves the original
      # failure semantics so Tofu still treats the apply as failed.
      "systemctl reload iedora.service || systemctl start iedora.service || { echo '--- iedora.service failed; dumping journal ---'; journalctl -xeu iedora.service --no-pager -n 200 || true; exit 1; }",
    ]
  }
}
