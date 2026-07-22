import {
  Database,
  env,
  expandFileSecrets,
  newServiceVerifier,
  remoteJwks,
  requireEnv,
  serve,
} from "@iedora/service-kit"

import { buildApp } from "./app.ts"
import type { AuditDB } from "./schema.ts"

expandFileSecrets()

const database = new Database<AuditDB>(requireEnv("AUDIT_DATABASE_URL"), { camelCase: false })
const verifier = newServiceVerifier(
  remoteJwks(env("AUTH_JWKS_URL", "https://auth.iedora.com/.well-known/jwks.json")),
  requireEnv("SERVICE_JWT_ISSUER"),
  env("SERVICE_AUDIENCE", "iedora-internal"),
)

serve(buildApp({ database, verifier }), {
  name: "iedora-audit",
  port: Number(env("AUDIT_PORT", "8081")),
  onShutdown: () => database.close(),
})
