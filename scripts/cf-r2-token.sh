#!/usr/bin/env bash
set -euo pipefail

# Create a permanent R2 API token via Cloudflare's REST API and derive the
# S3-compatible Access Key ID + Secret. Writes them to .kamal/secrets-common
# (or .kamal/secrets.<env> for non-default envs).
#
# Cloudflare officially documents this derivation:
#   Access Key ID     = api_token.id
#   Secret Access Key = sha256_hex(api_token.value)
# (https://developers.cloudflare.com/r2/api/tokens/)
#
# The Terraform provider can't reliably produce these (#6626 is about a
# different token type, "admin" not "R2 S3"). Direct API works.
#
# Inputs (env vars):
#   TF_VAR_cloudflare_api_token  — Cloudflare API token with permissions:
#                                  Account · Workers R2 Storage · Edit
#                                  User · API Tokens · Edit
#   TF_VAR_account_id            — 32-char hex
# Optional:
#   CF_ENV                       — env name (default = "default"); also picked
#                                  up from .envrc / .envrc.<name> if sourced
#   BUCKET_NAME                  — overrides the Tofu output
#
# Usage:
#   bash scripts/cf-r2-token.sh                  # current env from CF_ENV / default
#   CF_ENV=staging bash scripts/cf-r2-token.sh   # explicit env

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF_DIR="${REPO_ROOT}/infra/tofu/cloudflare"

: "${TF_VAR_cloudflare_api_token:?must be exported}"
: "${TF_VAR_account_id:?must be exported (32-char hex)}"

ENV_NAME="${CF_ENV:-default}"

# Resolve bucket name: override > Tofu output for the current workspace.
if [ -z "${BUCKET_NAME:-}" ]; then
  cd "${CF_DIR}"
  CURRENT_WS="$(tofu workspace show 2>/dev/null || echo default)"
  if [ "${CURRENT_WS}" != "${ENV_NAME}" ]; then
    tofu workspace select "${ENV_NAME}" >/dev/null
  fi
  BUCKET_NAME="$(tofu output -raw bucket_name 2>/dev/null || echo "")"
  cd "${REPO_ROOT}"
fi

if [ -z "${BUCKET_NAME}" ]; then
  echo "Error: BUCKET_NAME not set and no Tofu output for workspace ${ENV_NAME}." >&2
  echo "Set BUCKET_NAME explicitly or run \`make cf-new-env\` first." >&2
  exit 1
fi

CF_API="https://api.cloudflare.com/client/v4"
AUTH="Authorization: Bearer ${TF_VAR_cloudflare_api_token}"
ACCOUNT_ID="${TF_VAR_account_id}"

# ── Discover the R2 permission group IDs at runtime ───────────────────────────
# Cloudflare's permission_groups endpoint is the source of truth. Hardcoding
# the IDs would break the moment Cloudflare rotates them.

PERM_GROUPS_JSON="$(curl -fsS -H "${AUTH}" \
  "${CF_API}/user/tokens/permission_groups?scope=com.cloudflare.api.account.r2")" || {
  echo "Error: failed to list R2 permission groups (token missing 'User · API Tokens · Edit'?)." >&2
  exit 1
}

extract_id() {
  local name="$1"
  echo "${PERM_GROUPS_JSON}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for g in data.get('result', []):
    if g.get('name') == '$name':
        print(g['id'])
        sys.exit(0)
sys.exit(1)
" || {
    echo "Error: couldn't find permission group '${name}'." >&2
    return 1
  }
}

READ_PG="$(extract_id 'Workers R2 Storage Bucket Item Read')"
WRITE_PG="$(extract_id 'Workers R2 Storage Bucket Item Write')"

# ── Create the API token ─────────────────────────────────────────────────────

TOKEN_NAME="meta-menu-${ENV_NAME}-r2-$(date -u +%Y%m%d)"
RESOURCE_KEY="com.cloudflare.edge.r2.bucket.${ACCOUNT_ID}_default_${BUCKET_NAME}"

PAYLOAD="$(python3 -c "
import json, sys
print(json.dumps({
  'name': '${TOKEN_NAME}',
  'policies': [{
    'effect': 'allow',
    'resources': {'${RESOURCE_KEY}': '*'},
    'permission_groups': [
      {'id': '${READ_PG}'},
      {'id': '${WRITE_PG}'},
    ],
  }],
}))
")"

RESP="$(curl -fsS -X POST "${CF_API}/user/tokens" \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  --data "${PAYLOAD}")" || {
  echo "Error: token creation failed. Response:" >&2
  curl -s -X POST "${CF_API}/user/tokens" -H "${AUTH}" -H "Content-Type: application/json" --data "${PAYLOAD}" >&2
  exit 1
}

TOKEN_ID="$(echo "${RESP}" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['id'])")"
TOKEN_VALUE="$(echo "${RESP}" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['value'])")"

# S3 Secret = SHA-256 of the token value (officially documented).
S3_SECRET="$(printf '%s' "${TOKEN_VALUE}" | sha256sum | awk '{print $1}')"

# ── Write into the right Kamal secrets file ──────────────────────────────────

if [ "${ENV_NAME}" = "default" ] || [ "${ENV_NAME}" = "onprem" ] || [ "${ENV_NAME}" = "hetzner" ]; then
  # Single-env case OR the standard destinations — values shared, go into common.
  SECRETS_FILE="${REPO_ROOT}/.kamal/secrets-common"
else
  SECRETS_FILE="${REPO_ROOT}/.kamal/secrets.${ENV_NAME}"
fi

# Idempotent patch: replace S3_ACCESS_KEY / S3_SECRET_KEY / S3_ENDPOINT lines.
patch_or_append() {
  local file="$1"
  local key="$2"
  local val="$3"
  if [ -f "${file}" ] && grep -qE "^${key}=" "${file}"; then
    # macOS/Linux portable sed via temp file.
    tmp="$(mktemp)"
    awk -v k="${key}" -v v="${val}" 'BEGIN{FS=OFS="="} $1==k {print k"="v; next} {print}' "${file}" > "${tmp}"
    mv "${tmp}" "${file}"
  else
    echo "${key}=${val}" >> "${file}"
  fi
}

S3_ENDPOINT_VAL="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"
[ -f "${SECRETS_FILE}" ] || { umask 077; touch "${SECRETS_FILE}"; }
patch_or_append "${SECRETS_FILE}" "S3_ENDPOINT"   "${S3_ENDPOINT_VAL}"
patch_or_append "${SECRETS_FILE}" "S3_ACCESS_KEY" "${TOKEN_ID}"
patch_or_append "${SECRETS_FILE}" "S3_SECRET_KEY" "${S3_SECRET}"
chmod 600 "${SECRETS_FILE}"

echo
echo "R2 token created for bucket: ${BUCKET_NAME}"
echo "  Cloudflare token name:  ${TOKEN_NAME}"
echo "  Patched:                ${SECRETS_FILE}"
echo "    S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY"
echo
echo "To revoke later: dash → My Profile → API Tokens → ${TOKEN_NAME} → Delete."
