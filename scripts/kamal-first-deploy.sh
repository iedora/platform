#!/usr/bin/env bash
set -euo pipefail

# First-time Kamal deploy on a fresh server. Idempotent — safe to re-run.
#
# Why this exists: the pre-deploy hook runs migrations against the new image,
# but on first deploy the accessories (postgres, …) don't exist yet, so the
# migration would fail. Workaround: boot accessories first, then `kamal setup
# --skip-hooks`, then explicit first migration. (basecamp/kamal#526)
#
# Subsequent deploys use plain `make deploy` (= `kamal deploy`).

echo "==> 1/5 Bootstrap Docker on the server"
kamal server bootstrap

echo "==> 2/5 Boot accessories"
kamal accessory boot postgres
kamal accessory boot redis
kamal accessory boot minio
kamal accessory boot cloudflared

echo "==> 3/5 Wait for accessories"
sleep 10

echo "==> 4/5 Kamal setup (skip hooks — accessories already up)"
kamal setup --skip-hooks

echo "==> 5/5 First migration"
kamal app exec --primary "node scripts/migrate.mjs"

echo
echo "First deploy done. Subsequent deploys: \`make deploy\`."
