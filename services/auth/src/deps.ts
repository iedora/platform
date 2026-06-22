import type {
  Auditor,
  Database,
  JwtIssuer,
  ServiceTokenIssuer,
  ServiceVerifier,
  UserVerifier,
} from "@iedora/server-kit";

import type { AuthConfig } from "./config";
import type { ResetMailer } from "./mailer";
import type { AuthDB } from "./schema";

// Dependencies wired once at boot and handed to each auth slice. Password
// hashing uses server-kit's functions directly; the relay is started in index.ts.
export interface AuthDeps {
  db: Database<AuthDB>;
  issuer: JwtIssuer; // mints user access tokens
  userVerifier: UserVerifier; // verifies our own access tokens on authed routes
  serviceIssuer: ServiceTokenIssuer; // client-credentials → service tokens
  serviceVerifier: ServiceVerifier; // verifies inbound service tokens (admin reads)
  serviceClients: Map<string, string>; // clientId → secret
  auditor: Auditor; // OutboxWriter — records into the auth DB's outbox
  resetMailer: ResetMailer; // delivers password-reset + change-notice emails
  cfg: AuthConfig;
}
