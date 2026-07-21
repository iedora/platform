import {
  Database,
  expandFileSecrets,
  newUserVerifier,
  parseEd25519PublicKey,
  serve,
} from "@iedora/service-kit"
import { connect } from "inngest/connect"

import { buildApp } from "./app"
import { loadConfig } from "./config"
import { makeFunctions } from "./jobs/functions"
import { makeBilling } from "./lib/billing"
import { inngest } from "./lib/inngest"
import { makeLessonspace } from "./lib/lessonspace"
import type { TutorDB } from "./schema"

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

const deps = {
  db,
  userVerifier,
  cfg,
  billing: makeBilling(cfg),
  launchSpace: makeLessonspace(cfg.lessonspaceApiKey),
}

const app = buildApp(deps)

// Durable timers (recurring charge, auto-release, lesson-room) run over an
// outbound Inngest connect() worker — the service is internal, so Inngest reaches
// it via this persistent WebSocket rather than an inbound HTTP endpoint. Signing/
// event keys come from INNGEST_* env.
const inngestConnection = await connect({ apps: [{ client: inngest, functions: makeFunctions(deps) }] })

serve(app, {
  name: "iedora-tutor-api",
  port: cfg.port,
  onShutdown: async () => {
    await inngestConnection.close()
    await db.close()
  },
})
