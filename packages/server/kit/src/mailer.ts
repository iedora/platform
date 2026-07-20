// Email is a generic microservice reached over @iedora/email-sdk — no in-process
// SMTP transport. menu-kit just surfaces the EmailMessage wire type that the
// OutboxMailer enqueues (see outbox.ts) and the relay's EmailSink delivers to the
// email service.
export { EmailClient, type EmailMessage, type EmailSink } from "@iedora/email-sdk";
