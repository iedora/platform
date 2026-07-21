// @iedora/service-runtime — the platform services' shared server composition kit
// (auth + menu). Re-exports the shared
// @iedora/service-kit runtime (which itself re-exports the @iedora/server-kit
// kernel + createServiceApp/serve/Database/runMigrations/healthRoutes/OTel/env/
// service tokens) and adds the pieces that live one layer up: the audit outbox
// relay (audit/outbox/runservice) and the SMTP mailer.
export * from "@iedora/service-kit";

export * from "./audit.ts";
export * from "./mailer.ts";
export * from "./outbox.ts";
export * from "./runservice.ts";
