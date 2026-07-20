// The mail transport is @iedora/email — no custom SMTP wrapper. menu-kit just
// re-exports it so services have a single import surface. Delivery is
// createMailer(cfg).handler registered on the outbox relay (see relayHandlers);
// the enqueue side is OutboxMailer (see outbox.ts), which writes an EmailMessage
// to the shared outbox in the request's transaction.
export { createMailer, type EmailMessage, type Mailer, type SmtpConfig } from "@iedora/email";
