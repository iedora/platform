import {
  Database,
  JwtIssuer,
  ServiceTokenIssuer,
  expandFileSecrets,
  isProd,
  mailerFromConfig,
  newServiceVerifier,
  newUserVerifier,
  OutboxMailer,
  parseClients,
  parseEd25519Seed,
  runRelayService,
} from "@iedora/server-kit";

import { buildApp } from "./app";
import { loadConfig } from "./config";
import { makeResetMailer } from "./mailer";
import type { AuthDB } from "./schema";

expandFileSecrets();
const cfg = loadConfig();

const db = new Database<AuthDB>(cfg.authDatabaseUrl, { schema: cfg.dbSchema });

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
// OutboxMailer; the relay drains `email.send` rows and DELIVERS them through the
// real transport below — chosen from config (MailHog dev / Resend prod / noop).
const mailTransport = mailerFromConfig(cfg.smtp, { prod: isProd() });
const resetMailer = makeResetMailer(new OutboxMailer(db));

// runRelayService owns the audit DB + outbox writer/relay (audit + email) +
// graceful shutdown.
runRelayService({
  name: "iedora-auth",
  port: cfg.port,
  source: "auth",
  db,
  auditDatabaseUrl: cfg.auditDatabaseUrl,
  auditSchema: cfg.auditSchema,
  mailer: mailTransport,
  build: ({ auditor }) =>
    buildApp({ db, issuer, userVerifier, serviceIssuer, serviceVerifier, serviceClients: parseClients(cfg.serviceClients), auditor, resetMailer, cfg }),
});
