#!/bin/sh
# iedora backend entrypoint — run the service's migrations, THEN exec the
# service. Baked into the production image (ENTRYPOINT) and reused by compose
# in development, so a container always migrates before the app boots — the
# same behaviour in dev (compose) and prod (Kamal), with no reliance on a
# compose `&&` chain or a Kamal pre-deploy hook.
#
# The service is derived from the start command — `… services/<svc>/src/index.ts`
# → <svc> — so each role migrates its own database and nothing else. A non-server
# command (e.g. `kamal app exec sh`) matches nothing and skips straight to exec.
#
# Safe to run on every boot / per replica: runMigrations() takes a Postgres
# advisory lock (concurrent deploys serialize) and skips already-applied files,
# so a redundant run is a no-op rather than a hazard.
set -e

svc=""
for arg in "$@"; do
  case "$arg" in
    services/*/src/index.ts)
      svc=$(printf '%s' "$arg" | sed -n 's#^services/\([^/]*\)/src/index.ts$#\1#p')
      break
      ;;
  esac
done

if [ -n "$svc" ] && [ -f "services/$svc/src/migrate.ts" ]; then
  echo "{\"level\":\"info\",\"msg\":\"running migrations before boot\",\"service\":\"iedora-$svc\"}"
  bun run "services/$svc/src/migrate.ts"
fi

# Serve with --smol: a leaner JSC heap (smaller steady-state RSS) at a small GC
# cost that hides behind Postgres I/O — the right RAM trade on the shared single
# box where these services are I/O-bound. Only the `bun run` server command is
# rewritten; anything else (e.g. `kamal app exec sh`) execs unchanged.
if [ "$1" = "bun" ] && [ "$2" = "run" ]; then
  shift 2
  exec bun --smol run "$@"
fi

exec "$@"
