'use server'

import { redirect } from 'next/navigation'
import { parseWithZod } from '@conform-to/zod/v4'
import type { SubmissionResult } from '@conform-to/dom'
import { forgotPassword, login, logout, register, resetPassword } from '@iedora/auth-sdk/next'
import { brandUrl, isSameIedoraOrigin } from '@iedora/brand'
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from './schemas'

/**
 * Auth server actions — thin Conform wrappers over the ONE centralized auth
 * integration (@iedora/auth-sdk/next). The integration owns the credential
 * exchange with the shared iedora realm AND writes the SSO cookies; these
 * actions only validate the form (same Zod schema the form uses) and translate
 * failures into the Conform reply the form renders.
 */

export async function signInAction(
  _prev: unknown,
  formData: FormData,
): Promise<SubmissionResult> {
  const submission = parseWithZod(formData, { schema: signInSchema })
  if (submission.status !== 'success') return submission.reply()
  const result = await login(submission.value)
  // Wrong email/password (or any auth failure) — never leak which.
  if (result.error) return submission.reply({ formErrors: ['invalidCredentials'] })
  // Don't redirect from inside the action (racing the just-written cookies); the
  // form does the full-page navigation on success so the fresh SSO cookies are
  // always present at the destination.
  return submission.reply()
}

export async function signUpAction(
  _prev: unknown,
  formData: FormData,
): Promise<SubmissionResult> {
  const submission = parseWithZod(formData, { schema: signUpSchema })
  if (submission.status !== 'success') return submission.reply()
  const result = await register(submission.value)
  if (result.error) return submission.reply({ formErrors: ['signupFailed'] })
  return submission.reply()
}

/**
 * Forgot-password: kicks off a reset email. The auth service never reveals
 * whether the address exists, so this ALWAYS reports success (swallowing errors)
 * — the form shows a neutral "check your inbox" screen.
 */
export async function forgotPasswordAction(
  _prev: unknown,
  formData: FormData,
): Promise<SubmissionResult> {
  const submission = parseWithZod(formData, { schema: forgotPasswordSchema })
  if (submission.status !== 'success') return submission.reply()
  try {
    await forgotPassword(submission.value.email)
  } catch {
    // no enumeration, no error surface — still report success
  }
  return submission.reply()
}

/**
 * Reset-password: sets a new password from the emailed token. A bad / expired
 * token is surfaced as a form error; no auto-login (the success screen sends the
 * user to sign in).
 */
export async function resetPasswordAction(
  _prev: unknown,
  formData: FormData,
): Promise<SubmissionResult> {
  const submission = parseWithZod(formData, { schema: resetPasswordSchema })
  if (submission.status !== 'success') return submission.reply()
  const token = String(formData.get('token') ?? '')
  try {
    await resetPassword(token, submission.value.password)
  } catch {
    return submission.reply({ formErrors: ['resetLinkInvalid'] })
  }
  return submission.reply()
}

/** Revokes the session server-side and clears the SSO cookies. */
export async function signOutAction(next?: string): Promise<void> {
  await logout()
  redirect(isSameIedoraOrigin(next) ? next! : brandUrl())
}
