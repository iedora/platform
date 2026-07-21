// The shared services image entrypoint (services/docker-entrypoint.sh) runs
// `services/<svc>/src/migrate.ts` before boot. Auth's migration runner lives at
// src/platform/migrate.ts (it runs on import) — re-run it from the conventional
// path so auth migrates like every other service in the one iedora/api image.
import "./platform/migrate.ts"
