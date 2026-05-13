#!/usr/bin/env bash
set -euo pipefail

# Bootstrap inicial para um servidor fresh.
# Idempotent — safe to re-run, mas só é necessário a primeira vez por servidor.
#
# Resolve a ordem do `kamal setup` (pre-deploy hook corre ANTES dos
# accessories existirem). Ref: basecamp/kamal#526, lib/kamal/cli/main.rb.

echo "==> 1/5 Bootstrap Docker no servidor"
kamal server bootstrap

echo "==> 2/5 Boot dos accessories (Postgres, Redis) antes do app"
kamal accessory boot postgres
kamal accessory boot redis

echo "==> 3/5 Aguardar accessories ficarem ready"
sleep 8

echo "==> 4/5 Kamal setup inicial (skip hooks — accessories já estão up)"
kamal setup --skip-hooks

echo "==> 5/5 Primeira migration explícita"
kamal app exec --primary "node scripts/migrate.mjs"

echo
echo "Bootstrap done. Subsequent deploys: \`make kamal-deploy\` (hooks correm automaticamente)."
