import { Database, expandFileSecrets, newUserVerifier, remoteJwks, serve } from "@iedora/service-kit"
import { buildApp } from "./app.ts"
import { loadConfig } from "./config.ts"
import type { TutorDeps } from "./deps.ts"
import { createTutorJobs } from "./jobs/scheduler.ts"
import { makeBilling } from "./lib/billing.ts"
import { makeClassroom } from "./lib/classroom.ts"
import type { TutorDB } from "./schema.ts"

// Process entrypoint: expand _FILE secrets, load config, wire deps, serve.
expandFileSecrets()
const cfg = loadConfig()

const db = new Database<TutorDB>(cfg.tutorDatabaseUrl, {
  schema: cfg.dbSchema || undefined, // empty → default search_path (public)
  camelCase: true, // snake_case DB, camelCase TS (matches #db)
})

const userVerifier = newUserVerifier(remoteJwks(cfg.authJwksUrl), cfg.apiJwtIssuer, cfg.apiJwtAudience)

// The job runner's handlers close over `deps` (to open rooms, charge, release)
// and `deps` holds the runner — mutually referential. The `() => deps` thunk is
// only invoked at poll time, after `deps` is initialized, so it is safe.
const deps: TutorDeps = {
  db,
  userVerifier,
  cfg,
  billing: makeBilling(cfg),
  launchSpace: makeClassroom(cfg.classroomSigningKey, cfg.classroomUrl),
  jobs: createTutorJobs(cfg.tutorDatabaseUrl, () => deps),
}

const app = buildApp(deps)

// Durable timers (recurring charge, auto-release, lesson-room) run over a
// Postgres-backed scheduler that polls this service's OWN database — no external
// worker, no inbound endpoint. serve() starts it after listen, stops it on
// shutdown. Replaces the former Inngest connect() worker.
serve(app, {
  name: "iedora-tutor-api",
  port: cfg.port,
  workers: [deps.jobs],
  onShutdown: () => db.close(),
})
