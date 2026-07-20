import {
  AuditClient,
  Database,
  EmailClient,
  JwtIssuer,
  ServiceClient,
  ServiceTokenIssuer,
  expandFileSecrets,
  newServiceVerifier,
  newUserVerifier,
  OutboxMailer,
  parseClients,
  parseEd25519Seed,
  runRelayService,
} from "@iedora/menu-kit";

import { buildApp } from "./app";
import { loadConfig } from "./config";
import { makeResetMailer } from "./mailer";
import type { AuthDB } from "./schema";

expandFileSecrets();
const cfg = loadConfig();

const db = new Database<AuthDB>(cfg.authDatabaseUrl, { camelCase: false });

const keys = parseEd25519Seed(cfg.jwtSeed);
const issuer = new JwtIssuer({
  keys,
  kid: cfg.jwtKeyId,
  issuer: cfg.jwtIssuer,
  audience: cfg.jwtAudience,
  accessTtl: cfg.accessTtl,
});
const userVerifier = newUserVerifier(keys.publicKey, cfg.jwtIssuer, cfg.jwtAudience);
const serviceIssuer = new ServiceTokenIssuer({
  privateKey: keys.privateKey,
  kid: cfg.jwtKeyId,
  issuer: cfg.jwtIssuer,
  audience: cfg.serviceAudience,
  ttl: cfg.serviceTokenTtl,
});
const serviceVerifier = newServiceVerifier(keys.publicKey, cfg.jwtIssuer, cfg.serviceAudience);
// Email is a durable Postgres message, not an inline send. Request handlers
// ENQUEUE into the outbox (in the same tx as the business change) via the
// OutboxMailer; the relay drains `email.send` rows and POSTs them to the email
// microservice (email-sdk), which delivers via SMTP. Auth self-mints a service
// token (it holds the platform signing key).
const email = new EmailClient({
  baseUrl: cfg.emailBaseUrl,
  tokens: { token: () => serviceIssuer.issue("auth") },
});
const resetMailer = makeResetMailer(new OutboxMailer(db));

// Audit sink: auth POSTs events to the audit service (never its DB). Auth holds
// the platform signing key, so it self-mints its own service token rather than
// fetching one from itself.
const audit = new AuditClient(
  new ServiceClient(cfg.auditBaseUrl, { token: () => serviceIssuer.issue("auth") }, "audit"),
);

// runRelayService owns the outbox writer/relay (audit + email) + graceful
// shutdown; audit is delivered over HTTP via the sink above.
runRelayService({
  name: "iedora-auth",
  port: cfg.port,
  source: "auth",
  db,
  audit,
  email,
  build: ({ auditor }) =>
    buildApp({ db, issuer, userVerifier, serviceIssuer, serviceVerifier, serviceClients: parseClients(cfg.serviceClients), auditor, resetMailer, cfg }),
});
