import {
  Database,
  expandFileSecrets,
  newUserVerifier,
  parseEd25519PublicKey,
  serve,
} from "@iedora/service-kit"
import { buildApp } from "./app.ts"
import { loadConfig } from "./config.ts"
import type { TutorDeps } from "./deps.ts"
import { createTutorJobs } from "./jobs/scheduler.ts"
import { makeBilling } from "./lib/billing.ts"
import { makeLessonspace } from "./lib/lessonspace.ts"
import type { TutorDB } from "./schema.ts"

// Process entrypoint: expand _FILE secrets, load config, wire deps, serve.
expandFileSecrets()
const cfg = loadConfig()

const db = new Database<TutorDB>(cfg.tutorDatabaseUrl, {
  schema: cfg.dbSchema || undefined, // empty → default search_path (public)
  camelCase: true, // snake_case DB, camelCase TS (matches #db)
})

const userVerifier = newUserVerifier(
  await parseEd25519PublicKey(cfg.apiJwtPublicKey),
  cfg.apiJwtIssuer,
  cfg.apiJwtAudience,
)

// `jobs` needs `deps` (handlers open rooms, charge, release) and `deps` needs
// `jobs` — wire jobs first against a forward reference the runner only reads at
// poll time, then finalize deps.
let deps: TutorDeps
const jobs = createTutorJobs(cfg.tutorDatabaseUrl, () => deps)
deps = {
  db,
  userVerifier,
  cfg,
  billing: makeBilling(cfg),
  launchSpace: makeLessonspace(cfg.lessonspaceApiKey),
  jobs,
}

const app = buildApp(deps)

// Durable timers (recurring charge, auto-release, lesson-room) run over a
// Postgres-backed scheduler that polls this service's OWN database — no external
// worker, no inbound endpoint. serve() starts it after listen, stops it on
// shutdown. Replaces the former Inngest connect() worker.
serve(app, {
  name: "iedora-tutor-api",
  port: cfg.port,
  workers: [jobs],
  onShutdown: () => db.close(),
})
