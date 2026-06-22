import {
  Database,
  JwtIssuer,
  ServiceTokenIssuer,
  expandFileSecrets,
  isProd,
  newServiceVerifier,
  newUserVerifier,
  parseClients,
  parseEd25519Seed,
  runRelayService,
} from "@iedora/server-kit";

import { buildApp } from "./app";
import { loadConfig } from "./config";
import { loggingResetMailer, noopResetMailer } from "./mailer";
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
// No email transport is wired yet: prod drops the message (the reset is still
// recorded as an audit event), dev logs the link so the flow is testable.
const resetMailer = isProd() ? noopResetMailer : loggingResetMailer;

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
