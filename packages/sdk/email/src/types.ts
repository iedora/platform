/** A source of bearer service tokens (minted from @iedora/auth-sdk). */
export type TokenSource = { token(): Promise<string> }

/** The outbox topic email messages are enqueued under. */
export const EMAIL_TOPIC = "email.send"

/**
 * A transactional email — the wire shape the email service delivers via SMTP.
 * Structurally identical to @iedora/email's EmailMessage, redeclared here so the
 * SDK stays dependency-free (no nodemailer) and runs on edge runtimes.
 */
export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

/** One delivered outbox row: a stable message id (dedupe key) + the email. */
export interface EmailDelivery {
  messageId: string
  payload: Record<string, unknown>
}

/** The transport a producer's relay pushes queued emails through. The email
 *  service NEVER touches producers' DBs — messages cross the wire as HTTP. */
export interface EmailSink {
  deliver(messages: EmailDelivery[]): Promise<void>
}

/* --------------------------------- read side ------------------------------- */

/** One recorded delivery from the email service's log (GET /deliveries). */
export interface EmailRecord {
  id: string
  at: string // RFC3339
  source: string
  tenantId?: string
  to: string
  subject: string
  status: string // "sent" | "failed"
  error?: string
  messageId?: string
}

/** Filters + keyset cursor for querying the delivery log. */
export interface EmailFilter {
  source?: string
  status?: string
  /** Substring match on the recipient address. */
  to?: string
  tenant?: string
  before_at?: string
  before_id?: string
  limit?: number
}

/** GET /deliveries response — newest-first, with a keyset `next` cursor. */
export interface EmailQueryResponse {
  deliveries: EmailRecord[]
  next?: { at: string; id: string }
}

/** Thrown by the client on a non-2xx response. */
export class EmailError extends Error {
  constructor(
    public status: number,
    message?: string,
  ) {
    super(message ?? `email: ${status}`)
    this.name = "EmailError"
  }
}
