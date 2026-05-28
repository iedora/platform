#!/usr/bin/env bash
# Idempotent. Zero flags. Remote: `DOCKER_HOST=ssh://root@<host> ./bin.sh`.
# `.env` (committed) tem config hardcoded; `bws run` injecta secrets.
set -euo pipefail
: "${BWS_ACCESS_TOKEN:?must be set}"
docker network inspect homelab-core >/dev/null 2>&1 || docker network create homelab-core
cd "$(dirname "${BASH_SOURCE[0]}")"
exec bws run -- docker compose up -d
