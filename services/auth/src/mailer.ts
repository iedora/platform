import type { EmailMessage } from "@iedora/service-runtime";

/** The send-only contract this module needs — fulfilled by the OutboxMailer
 *  (enqueue) at the composition root; delivery happens later via @iedora/email. */
type EmailSender = { send(msg: EmailMessage): Promise<void> };

// Password-reset / account emails, formatted once and enqueued through an
// EmailSender. This file owns only the message content; the raw reset URL/token
// only ever passes THROUGH here in memory (never persisted).
//
// Security: the raw reset URL/token only ever passes THROUGH here in memory —
// it's never persisted (the token is hashed at rest).
export interface ResetMailer {
  /** Send the reset link (contains the one-time token) to the account email. */
  sendPasswordReset(to: string, resetUrl: string): Promise<void>;
  /** Notify the account that its password was changed (never includes secrets). */
  sendPasswordChanged(to: string): Promise<void>;
}

// --- iedora-branded HTML shell (matches the app's warm-paper + green-pill
// design language; table-based + inline styles so it survives every mail
// client). ---
const GREEN = "#2e7d32";
const INK = "#1f2937";
const MUTED = "#6b7280";
const PAPER = "#f4f2ec";
const CARD = "#ffffff";
const BORDER = "#e7e3da";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** A CTA pill button (bulletproof-ish: a table cell so the brand colour fills,
 *  rounded where supported, square-but-fine in Outlook). */
function button(label: string, url: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 4px;">` +
    `<tr><td bgcolor="${GREEN}" style="border-radius:999px;">` +
    `<a href="${url}" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;` +
    `font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">${label}</a>` +
    `</td></tr></table>`
  );
}

/** Wraps body content in the iedora email shell: warm canvas, a centred white
 *  card, the wordmark, then the content and a muted footer note. */
function shell(opts: { preheader: string; heading: string; bodyHtml: string; footerHtml: string }): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:0;background:${PAPER};">` +
    `<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</span>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">` +
    // wordmark
    `<tr><td style="padding:0 4px 18px;">` +
    `<span style="font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:-0.02em;color:${GREEN};">iedora</span>` +
    `</td></tr>` +
    // card
    `<tr><td style="background:${CARD};border:1px solid ${BORDER};border-radius:18px;padding:30px 28px;">` +
    `<h1 style="margin:0 0 12px;font-family:${FONT};font-size:21px;line-height:1.3;font-weight:800;color:${INK};">${opts.heading}</h1>` +
    opts.bodyHtml +
    `</td></tr>` +
    // footer
    `<tr><td style="padding:18px 6px 0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${MUTED};">${opts.footerHtml}</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

function para(text: string): string {
  return `<p style="margin:0 0 12px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">${text}</p>`;
}

/** Builds the {@link ResetMailer} over any {@link EmailSender} (the OutboxMailer). */
export function makeResetMailer(mailer: EmailSender): ResetMailer {
  return {
    async sendPasswordReset(to, resetUrl) {
      await mailer.send({
        to,
        subject: "Reset your iedora password",
        text:
          `We received a request to reset your iedora password.\n\n` +
          `Reset it here (the link expires soon):\n${resetUrl}\n\n` +
          `If you didn't ask for this, you can ignore this email — your password stays the same.`,
        html: shell({
          preheader: "Reset your iedora password — the link expires soon.",
          heading: "Reset your password",
          bodyHtml:
            para("We received a request to reset your iedora password. Tap the button below to set a new one.") +
            button("Reset password", resetUrl) +
            `<p style="margin:14px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${MUTED};">` +
            `The link expires soon. If the button doesn't work, paste this into your browser:<br>` +
            `<a href="${resetUrl}" style="color:${GREEN};word-break:break-all;">${resetUrl}</a></p>`,
          footerHtml:
            `If you didn't ask for this, you can safely ignore this email — your password stays the same.`,
        }),
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
        html: shell({
          preheader: "Your iedora password was just changed.",
          heading: "Your password was changed",
          bodyHtml:
            para("Your iedora password was just changed. If this was you, you're all set — no action needed.") +
            para(
              `If it <strong>wasn't</strong> you, reset your password immediately and contact us at ` +
                `<a href="mailto:hello@iedora.com" style="color:${GREEN};">hello@iedora.com</a>.`,
            ),
          footerHtml: "This is an automated security notice from iedora.",
        }),
      });
    },
  };
}
