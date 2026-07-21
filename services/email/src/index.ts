import { createMailer } from "./mailer"
import {
  Database,
  env,
  expandFileSecrets,
  newServiceVerifier,
  parseEd25519PublicKey,
  requireEnv,
  serve,
} from "@iedora/service-kit"

import { buildApp } from "./app"
import type { EmailDB } from "./schema"

expandFileSecrets()

const database = new Database<EmailDB>(requireEnv("EMAIL_DATABASE_URL"), { camelCase: false })

// With no SMTP_HOST the mailer swallows to a dev JSON transport, so the service
// boots and dedupes in dev without a real SMTP server.
const mailer = createMailer({
  host: env("SMTP_HOST", "") || undefined,
  port: env("SMTP_PORT", "") ? Number(env("SMTP_PORT", "")) : undefined,
  user: env("SMTP_USER", "") || undefined,
  pass: env("SMTP_PASS", "") || undefined,
  from: requireEnv("EMAIL_FROM"),
})

const verifier = newServiceVerifier(
  await parseEd25519PublicKey(requireEnv("SERVICE_JWT_PUBLIC_KEY")),
  requireEnv("SERVICE_JWT_ISSUER"),
  env("SERVICE_AUDIENCE", "iedora-internal"),
)

serve(buildApp({ database, mailer, verifier }), {
  name: "iedora-email",
  port: Number(env("EMAIL_PORT", "8082")),
  onShutdown: () => database.close(),
})
