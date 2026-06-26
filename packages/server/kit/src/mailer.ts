import { createTransport, type Transporter } from "nodemailer";

// Generic email seam shared by every service. The CONTRACT is `Mailer.send`;
// the transport is chosen at the composition root from config, so the same code
// talks to MailHog locally (no auth, port 1025) and Resend/SES/etc. in prod
// (host + credentials + implicit TLS). No provider-specific code lives here.

/** One outbound email. `text` is the required plain-text body/fallback; `html`
 *  is an optional rich body. No secrets beyond what the caller puts in. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** The mail contract services depend on — one transport-agnostic method. */
export interface Mailer {
  send(msg: EmailMessage): Promise<void>;
}

/** SMTP transport config. Generic over any SMTP server. `host` empty means "no
 *  transport configured" (the caller falls back to noop/logging). */
export interface SmtpConfig {
  host: string;
  port: number;
  /** Omit (empty) for servers that need no auth, e.g. MailHog. */
  user: string;
  pass: string;
  /** Implicit TLS (true, port 465) vs STARTTLS/plaintext (false, 587/1025). */
  secure: boolean;
  /** The From header, e.g. `iedora <no-reply@iedora.com>`. */
  from: string;
}

/** A {@link Mailer} backed by SMTP via nodemailer. The transporter is built once
 *  and reused; auth is sent only when a user is configured. */
export function smtpMailer(cfg: SmtpConfig): Mailer {
  const transport: Transporter = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  return {
    async send(msg) {
      await transport.sendMail({
        from: cfg.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      });
    },
  };
}

/** Drops every message — the safe fallback when no transport is configured. */
export const noopMailer: Mailer = {
  async send() {},
};

/** Logs the message to stdout instead of sending — local/dev when no SMTP server
 *  is running. Includes the text body so a dev can follow links (dev-only). */
export const loggingMailer: Mailer = {
  async send(msg) {
    console.info(
      JSON.stringify({ level: "info", msg: "email (dev, not sent)", to: msg.to, subject: msg.subject, text: msg.text }),
    );
  },
};

/** Pick a mailer from config: a real SMTP transport when a host is set (MailHog
 *  or a prod provider), else logging in dev / noop in prod. One rule both
 *  environments share — the transport is data, not a code branch per env. */
export function mailerFromConfig(smtp: SmtpConfig, opts: { prod: boolean }): Mailer {
  if (smtp.host) return smtpMailer(smtp);
  return opts.prod ? noopMailer : loggingMailer;
}
