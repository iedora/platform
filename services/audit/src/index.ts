import {
  Database,
  env,
  expandFileSecrets,
  newServiceVerifier,
  parseEd25519PublicKey,
  requireEnv,
  serve,
} from "@iedora/server-kit";

import { buildApp } from "./app";
import type { AuditDB } from "./schema";

expandFileSecrets();

const database = new Database<AuditDB>(requireEnv("AUDIT_DATABASE_URL"), { schema: env("DB_SCHEMA", "audit") });
const verifier = newServiceVerifier(
  await parseEd25519PublicKey(requireEnv("SERVICE_JWT_PUBLIC_KEY")),
  requireEnv("SERVICE_JWT_ISSUER"),
  env("SERVICE_AUDIENCE", "iedora-internal"),
);

serve(buildApp({ database, verifier }), {
  name: "iedora-audit",
  port: Number(env("AUDIT_PORT", "8081")),
  onShutdown: () => database.close(),
});
