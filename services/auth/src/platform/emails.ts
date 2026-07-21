import { button, htmlShell, paragraph } from "./email-template.ts"

// Auth's transactional-email copy, composed from @iedora/email's HTML primitives.
// Branding is just the tenant name. Each returns subject + html + text.

export type RenderedEmail = { subject: string; html: string; text: string }

const ignoreFooter = `<p style="font-size:12px;color:#9ca3af;margin:32px 0 0">If you didn't expect this email, you can safely ignore it.</p>`

export function passwordResetEmail(brand: string, resetUrl: string, ttlMinutes: number): RenderedEmail {
  return {
    subject: `Reset your ${brand} password`,
    html: htmlShell(
      brand,
      "Reset your password",
      paragraph(`Click below to choose a new password. This link expires in ${ttlMinutes} minutes.`) +
        button(resetUrl, "Reset password") +
        `<p style="font-size:12px;color:#9ca3af;margin:0">Or paste this link: ${resetUrl}</p>` +
        ignoreFooter,
    ),
    text: `Reset your ${brand} password\n\nOpen this link to choose a new password (expires in ${ttlMinutes} minutes):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
  }
}

export function passwordChangedEmail(brand: string): RenderedEmail {
  return {
    subject: `Your ${brand} password was changed`,
    html: htmlShell(
      brand,
      "Your password was changed",
      paragraph(
        "Your password was just changed and other signed-in devices were logged out. If this wasn't you, reset your password immediately and contact support.",
      ) + ignoreFooter,
    ),
    text: `Your ${brand} password was just changed and other devices were signed out.\n\nIf this wasn't you, reset your password immediately.`,
  }
}
