#!/usr/bin/env bash
set -euo pipefail

# One-shot, idempotent host bootstrap. Replaces the Ansible playbooks.
#
# Prerequisites (one-time):
#   1. Your SSH pubkey is on the box for $SUDO_USER:
#        ssh-copy-id $SUDO_USER@$HOST          # paste their password once
#   2. $SUDO_USER can sudo (typical for the user you created at Ubuntu install).
#
# Run:
#   make host-init HOST=box.local SUDO_USER=ubuntu
#
# You'll be prompted ONCE for $SUDO_USER's password (for sudo). After this
# script finishes, `kamal setup` can SSH in as the `deploy` user and install
# Docker itself.

: "${HOST:?usage: HOST=box.local [SUDO_USER=ubuntu] scripts/host-init.sh}"
SUDO_USER="${SUDO_USER:-root}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519.pub}"

[[ -f "$SSH_KEY" ]] || {
  echo "SSH key not found at $SSH_KEY. Run: ssh-keygen -t ed25519" >&2
  exit 1
}

PUBKEY=$(cat "$SSH_KEY")

echo "==> host-init on $HOST as $SUDO_USER (creating $DEPLOY_USER)"
echo "    You'll be prompted for $SUDO_USER's password (for sudo)."

# Write the remote script to a local temp file, scp it to the box, then run
# it with `ssh -t … sudo`. This avoids the heredoc-vs-TTY conflict that
# breaks `ssh -t … sudo bash -s <<EOF`.
LOCAL_TMP=$(mktemp -t host-init-remote.XXXXXX)
trap 'rm -f "$LOCAL_TMP"' EXIT

cat > "$LOCAL_TMP" <<REMOTE
#!/usr/bin/env bash
set -euo pipefail

DEPLOY_USER='$DEPLOY_USER'
PUBKEY='$PUBKEY'

# 1. Create deploy user with passwordless sudo (idempotent).
if ! id -u "\$DEPLOY_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash -G sudo "\$DEPLOY_USER"
fi
echo "\$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-\$DEPLOY_USER"
chmod 0440 "/etc/sudoers.d/90-\$DEPLOY_USER"
visudo -cf "/etc/sudoers.d/90-\$DEPLOY_USER" >/dev/null

# 2. Install SSH key (idempotent — grep-and-append).
install -d -m 0700 -o "\$DEPLOY_USER" -g "\$DEPLOY_USER" "/home/\$DEPLOY_USER/.ssh"
if ! grep -qF "\$PUBKEY" "/home/\$DEPLOY_USER/.ssh/authorized_keys" 2>/dev/null; then
  echo "\$PUBKEY" >> "/home/\$DEPLOY_USER/.ssh/authorized_keys"
fi
chmod 0600 "/home/\$DEPLOY_USER/.ssh/authorized_keys"
chown "\$DEPLOY_USER:\$DEPLOY_USER" "/home/\$DEPLOY_USER/.ssh/authorized_keys"

# 3. Pre-create docker group + add deploy user to it (idempotent).
#    Docker isn't installed yet — `kamal server bootstrap` does that — but
#    pre-seeding the group means the deploy user can talk to /var/run/docker.sock
#    as soon as Docker installs (instead of failing on first kamal command).
groupadd -f docker
usermod -aG docker "\$DEPLOY_USER"

# 4. Disable root login + password auth (idempotent).
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh 2>/dev/null || systemctl reload sshd

echo "[host-init] done."
REMOTE

REMOTE_PATH="/tmp/host-init-$$.sh"
scp -q -o StrictHostKeyChecking=accept-new "$LOCAL_TMP" "$SUDO_USER@$HOST:$REMOTE_PATH"

# Run with -t for a real TTY (sudo password prompt). No stdin redirection,
# so the prompt works cleanly.
ssh -t -o StrictHostKeyChecking=accept-new "$SUDO_USER@$HOST" \
    "sudo bash $REMOTE_PATH && rm -f $REMOTE_PATH"

echo "==> done. Test: ssh $DEPLOY_USER@$HOST"
echo "    Next: make deploy will continue from here"
