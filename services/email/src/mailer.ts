import nodemailer, { type Transporter } from "nodemailer"

export type SmtpConfig = {
  /** SMTP host. When unset the mailer logs instead of sending (local/dev). */
  host?: string
  port?: number
  user?: string
  pass?: string
  /** From address, e.g. "Acme <no-reply@acme.com>". */
  from: string
}

/** A transactional email. */
export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
}

/** Minimal shape of a delivered outbox message — structurally compatible with
 *  @iedora/messaging's DeliveredMessage, so email needs no dependency on it. */
type DeliveredMessage = { payload: Record<string, unknown> }

export type Mailer = {
  /** Send one email now. */
  send(msg: EmailMessage): Promise<void>
  /** A message-handler that sends the payload as an email — register it for an
   *  "email" topic on a @iedora/messaging dispatcher. */
  handler(msg: DeliveredMessage): Promise<void>
}

/**
 * An SMTP mailer. With no `host` it swallows to a JSON transport (dev), so it's
 * safe to wire everywhere and switch on purely by configuring SMTP.
 */
export function createMailer(config: SmtpConfig): Mailer {
  let transporter: Transporter | null = null
  const transport = (): Transporter => {
    if (transporter) return transporter
    const port = config.port ?? 587
    transporter = config.host
      ? nodemailer.createTransport({
          host: config.host,
          port,
          secure: port === 465,
          auth: config.user ? { user: config.user, pass: config.pass } : undefined,
        })
      : nodemailer.createTransport({ jsonTransport: true })
    return transporter
  }

  async function send(msg: EmailMessage): Promise<void> {
    await transport().sendMail({
      from: config.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    })
    if (!config.host) console.log(`[email] (dev, not sent) "${msg.subject}" -> ${msg.to}`)
  }

  return {
    send,
    handler: (m) => send(m.payload as unknown as EmailMessage),
  }
}
