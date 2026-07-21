#!/bin/sh
# iedora backend entrypoint — run the service's migrations, THEN exec the
# service. Baked into the production image (ENTRYPOINT) and reused by compose
# in development, so a container always migrates before the app boots — the
# same behaviour in dev (compose) and prod (Kamal), with no reliance on a
# compose `&&` chain or a Kamal pre-deploy hook.
#
# The service dir is derived from the start command — the arg ending in
# `<dir>/src/index.ts` gives <dir> — so each role migrates its own database and
# nothing else. Standalone services live at `services/<svc>`; a product's backend
# at `products/<product>/api`. A non-server command (e.g. `kamal app exec sh`)
# matches nothing and skips straight to exec.
#
# Safe to run on every boot / per replica: runMigrations() takes a Postgres
# advisory lock (concurrent deploys serialize) and skips already-applied files,
# so a redundant run is a no-op rather than a hazard.
set -e

svc_dir=""
for arg in "$@"; do
  case "$arg" in
    */src/index.ts)
      svc_dir=${arg%/src/index.ts}
      break
      ;;
  esac
done

if [ -n "$svc_dir" ] && [ -f "$svc_dir/src/migrate.ts" ]; then
  # Display name for the log line: products/<p>/api → <p>; services/<s> → <s>.
  case "$svc_dir" in
    products/*/api) name=$(printf '%s' "$svc_dir" | sed -n 's#^products/\([^/]*\)/api$#\1#p') ;;
    *)              name=$(basename "$svc_dir") ;;
  esac
  echo "{\"level\":\"info\",\"msg\":\"running migrations before boot\",\"service\":\"iedora-$name\"}"
  node "$svc_dir/src/migrate.ts"
fi

# Node 26 runs the .ts entrypoint directly (stable strip-only type-stripping, no
# build). The CMD is `node <svc>/src/index.ts`, so exec it as-is; a non-server
# command (e.g. `kamal app exec sh`) execs unchanged too.
exec "$@"
