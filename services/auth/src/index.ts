import {
  Database,
  JwtIssuer,
  ServiceTokenIssuer,
  expandFileSecrets,
  isProd,
  mailerFromConfig,
  newServiceVerifier,
  newUserVerifier,
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

const db = new Database<AuthDB>(cfg.authDatabaseUrl);

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
// Transport chosen from config: SMTP when SMTP_HOST is set (MailHog in dev,
// Resend/SES/etc. in prod), else dev logs the link / prod drops it (the reset is
// still recorded as an audit event). The account emails are formatted on top.
const resetMailer = makeResetMailer(mailerFromConfig(cfg.smtp, { prod: isProd() }));

// runRelayService owns the audit DB + outbox writer/relay + graceful shutdown.
runRelayService({
  name: "iedora-auth",
  port: cfg.port,
  source: "auth",
  db,
  auditDatabaseUrl: cfg.auditDatabaseUrl,
  build: ({ auditor }) =>
    buildApp({ db, issuer, userVerifier, serviceIssuer, serviceVerifier, serviceClients: parseClients(cfg.serviceClients), auditor, resetMailer, cfg }),
});
