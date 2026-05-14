#!/usr/bin/env bash
set -euo pipefail

# Reads non-sensitive outputs from `infra/tofu/cloudflare/` and writes them
# into .envrc at the repo root. Sensitive outputs (CLOUDFLARED_TUNNEL_TOKEN)
# are included so direnv / `source .envrc` exposes everything the Makefile
# targets and Kamal need.
#
# .envrc is gitignored. If you use direnv, run `direnv allow` after this.
# Otherwise `source .envrc` before running make targets.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF_DIR="${REPO_ROOT}/infra/tofu/cloudflare"
ENVRC="${REPO_ROOT}/.envrc"

cd "${CF_DIR}"

# Sanity check — tofu must have a state file with outputs.
if ! tofu output -json >/dev/null 2>&1; then
  echo "Error: no Tofu state in ${CF_DIR}. Run \`make cloudflare-up\` first." >&2
  exit 1
fi

# Preserve any existing state passphrase line (it doesn't come from Tofu).
EXISTING_PASSPHRASE=""
if [ -f "${ENVRC}" ]; then
  EXISTING_PASSPHRASE="$(grep -E '^export TF_VAR_state_passphrase=' "${ENVRC}" || true)"
fi

# Read outputs (sensitive ones come from `tofu output -raw <name>`).
PUBLIC_HOSTNAME="$(tofu output -raw public_hostname)"
S3_ENDPOINT="$(tofu output -raw s3_endpoint)"
S3_BUCKET="$(tofu output -raw bucket_name)"
CLOUDFLARED_TUNNEL_TOKEN="$(tofu output -raw tunnel_token)"

umask 077
{
  echo "# Auto-managed by scripts/cf-sync.sh — re-run after \`make cloudflare-up\`."
  echo "# Gitignored. Source manually or via direnv."
  echo
  if [ -n "${EXISTING_PASSPHRASE}" ]; then
    echo "# Preserved across syncs:"
    echo "${EXISTING_PASSPHRASE}"
    echo
  fi
  echo "# Cloudflare-managed (Tofu outputs):"
  echo "export PUBLIC_HOSTNAME='${PUBLIC_HOSTNAME}'"
  echo "export S3_ENDPOINT='${S3_ENDPOINT}'"
  echo "export S3_BUCKET='${S3_BUCKET}'"
  echo "export S3_REGION='auto'"
  echo "export CLOUDFLARED_TUNNEL_TOKEN='${CLOUDFLARED_TUNNEL_TOKEN}'"
} > "${ENVRC}"

echo "Wrote ${ENVRC} ($(wc -l < "${ENVRC}") lines)."
echo
echo "Next: source it (or 'direnv allow') and continue with onprem-setup / kamal-deploy."
