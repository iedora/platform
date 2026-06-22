'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { parseWithZod } from '@conform-to/zod/v4'
import type { SubmissionResult } from '@conform-to/dom'
import {
  ApiError,
  REFRESH_COOKIE,
  authCookies,
  clearedAuthCookies,
  forgotPassword,
  login,
  logout,
  register,
  resetPassword,
  type AuthResult,
} from '@iedora/api-client'
import { brandUrl, isSameIedoraOrigin } from '@iedora/brand'
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from './schemas'

/**
 * Auth server actions — the only code that exchanges credentials with
 * the auth service and writes the auth cookies. The sign-in / sign-up
 * forms submit here via Conform + useActionState: the action validates
 * with the SAME Zod schema the form uses (no drift), returns a Conform
 * `submission.reply()` on failure (field/form error keys the form
 * translates), and redirects to the validated `next` target on success.
 */

export async function signInAction(
  _prev: unknown,
  formData: FormData,
): Promise<SubmissionResult> {
  const submission = parseWithZod(formData, { schema: signInSchema })
  if (submission.status !== 'success') return submission.reply()
  let result: AuthResult
  try {
    result = await login(submission.value.email, submission.value.password)
  } catch {
    // Wrong email/password (or any auth failure) — never leak which.
    return submission.reply({ formErrors: ['invalidCredentials'] })
  }
  await persistAuth(result)
  redirect(safeNext(formData))
}

export async function signUpAction(
  _prev: unknown,
  formData: FormData,
): Promise<SubmissionResult> {
  const submission = parseWithZod(formData, { schema: signUpSchema })
  if (submission.status !== 'success') return submission.reply()
  let result: AuthResult
  try {
    result = await register(submission.value.email, submission.value.password, submission.value.name)
  } catch (err) {
    // A 409 means the email is taken — surface it on the email field;
    // anything else is a generic, form-level failure.
    if (err instanceof ApiError && err.status === 409) {
      return submission.reply({ fieldErrors: { email: ['emailTaken'] } })
    }
    return submission.reply({ formErrors: ['signupFailed'] })
  }
  await persistAuth(result)
  redirect(safeNext(formData))
}

/**
 * Forgot-password: kicks off a reset email. The auth service never
 * reveals whether the address exists, so on a valid email this ALWAYS
 * reports success (swallowing errors) — the form reads the success status
 * and shows a neutral "check your inbox" screen.
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
  return submission.reply() // status 'success' → form shows the "sent" screen
}

/**
 * Reset-password: sets a new password from the emailed token. The schema
 * validates the password policy + confirmation match (client + server);
 * the auth service rejects a bad / expired token (surfaced as a form
 * error). No auto-login — the form's success screen sends the user to
 * sign in afterwards.
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
  return submission.reply() // status 'success' → form shows the "done" screen
}

/** Revokes the session server-side and clears both auth cookies. */
export async function signOutAction(next?: string): Promise<void> {
  const store = await cookies()
  const refreshToken = store.get(REFRESH_COOKIE)?.value
  if (refreshToken) {
    await logout(refreshToken)
  }
  for (const c of clearedAuthCookies()) {
    store.set(c.name, c.value, c.options)
  }
  redirect(isSameIedoraOrigin(next) ? next! : brandUrl())
}

async function persistAuth(result: AuthResult): Promise<void> {
  const store = await cookies()
  for (const c of authCookies(result.tokens, result.setCookies)) {
    store.set(c.name, c.value, c.options)
  }
}

function safeNext(formData: FormData): string {
  const next = formData.get('next')
  return typeof next === 'string' && isSameIedoraOrigin(next) ? next : brandUrl()
}
