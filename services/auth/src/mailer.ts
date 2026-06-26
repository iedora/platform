import type { Mailer } from "@iedora/server-kit";

// Password-reset / account emails, formatted once and sent through the generic
// {@link Mailer} contract (server-kit). The transport (MailHog, Resend, …) is
// chosen at the composition root; this file owns only the message content.
//
// Security: the raw reset URL/token only ever passes THROUGH here in memory —
// it's never persisted (the token is hashed at rest).
export interface ResetMailer {
  /** Send the reset link (contains the one-time token) to the account email. */
  sendPasswordReset(to: string, resetUrl: string): Promise<void>;
  /** Notify the account that its password was changed (never includes secrets). */
  sendPasswordChanged(to: string): Promise<void>;
}

/** Builds the {@link ResetMailer} over any {@link Mailer} transport. */
export function makeResetMailer(mailer: Mailer): ResetMailer {
  return {
    async sendPasswordReset(to, resetUrl) {
      await mailer.send({
        to,
        subject: "Reset your iedora password",
        text:
          `We received a request to reset your iedora password.\n\n` +
          `Reset it here (the link expires soon):\n${resetUrl}\n\n` +
          `If you didn't ask for this, you can ignore this email — your password stays the same.`,
        html:
          `<p>We received a request to reset your iedora password.</p>` +
          `<p><a href="${resetUrl}">Reset your password</a> (the link expires soon).</p>` +
          `<p>If you didn't ask for this, you can ignore this email — your password stays the same.</p>`,
      });
    },
    async sendPasswordChanged(to) {
      await mailer.send({
        to,
        subject: "Your iedora password was changed",
        text:
          `Your iedora password was just changed.\n\n` +
          `If this was you, no action is needed. If it wasn't, reset your password immediately ` +
          `and contact us at hello@iedora.com.`,
        html:
          `<p>Your iedora password was just changed.</p>` +
          `<p>If this was you, no action is needed. If it wasn't, reset your password immediately ` +
          `and contact us at <a href="mailto:hello@iedora.com">hello@iedora.com</a>.</p>`,
      });
    },
  };
}
