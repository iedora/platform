// Email is a generic microservice reached over @iedora/sdk/email — no in-process
// SMTP transport. service-runtime just surfaces the EmailMessage wire type that the
// OutboxMailer enqueues (see outbox.ts) and the relay's EmailSink delivers to the
// email service.
export { EmailClient, type EmailMessage, type EmailSink } from "@iedora/sdk/email";
