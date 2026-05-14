#!/usr/bin/env bash
set -euo pipefail

# Prints instructions for creating an R2 API token via the Cloudflare dashboard.
# The Cloudflare Terraform provider can't reliably produce S3-compatible
# Access Key ID + Secret as of v5.19 / Jan 2026 (issue #6626), and there's no
# wrangler subcommand for permanent R2 tokens either. So: one-click dashboard.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF_DIR="${REPO_ROOT}/infra/tofu/cloudflare"

# Best-effort: read bucket name from Tofu output (or fall back to default).
BUCKET="metamenu"
if cd "${CF_DIR}" 2>/dev/null && tofu output -raw bucket_name >/dev/null 2>&1; then
  BUCKET="$(tofu output -raw bucket_name)"
fi

cat <<EOF
─────────────────────────────────────────────────────────────────────────────
Create an R2 API token for bucket: ${BUCKET}
─────────────────────────────────────────────────────────────────────────────

  1. Open: https://dash.cloudflare.com/?to=/:account/r2/api-tokens
  2. "Create API token"
       Token name:    meta-menu-${BUCKET}
       Permissions:   Object Read & Write
       Specify bucket: ${BUCKET}
       TTL:           Forever
  3. Click "Create API Token". Copy the values shown ONCE.
  4. Paste into .kamal/secrets-common (replace the empty placeholders):

       S3_ACCESS_KEY=<Access Key ID>
       S3_SECRET_KEY=<Secret Access Key>

  The S3_ENDPOINT line is already set by \`make cloudflare-up\` →
  \`scripts/cf-sync.sh\` (writes it into .envrc).

─────────────────────────────────────────────────────────────────────────────
EOF
