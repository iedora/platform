import {
  Database,
  env,
  expandFileSecrets,
  newServiceVerifier,
  parseEd25519PublicKey,
  requireEnv,
  serve,
} from "@iedora/service-kit"

import { buildApp } from "./app.ts"
import type { AuditDB } from "./schema.ts"

expandFileSecrets()

const database = new Database<AuditDB>(requireEnv("AUDIT_DATABASE_URL"), { camelCase: false })
const verifier = newServiceVerifier(
  await parseEd25519PublicKey(requireEnv("SERVICE_JWT_PUBLIC_KEY")),
  requireEnv("SERVICE_JWT_ISSUER"),
  env("SERVICE_AUDIENCE", "iedora-internal"),
)

serve(buildApp({ database, verifier }), {
  name: "iedora-audit",
  port: Number(env("AUDIT_PORT", "8081")),
  onShutdown: () => database.close(),
})
