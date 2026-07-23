"use server"

import type { SubmissionResult } from "@conform-to/dom"
import { parseWithZod } from "@conform-to/zod/v4"
import { login, register } from "@iedora/auth-sdk/next"

import { signInSchema, signUpSchema } from "./schemas.ts"

// Central-auth server actions — thin Conform wrappers over the ONE shared auth
// integration (@iedora/auth-sdk/next), which owns the credential exchange with
// the iedora realm AND writes the shared .iedora.com SSO cookies. These actions
// only validate the form and translate failures into a Conform reply. On success
// the form does a full-page navigation to `next` so the fresh cookies are always
// present at the destination — never redirect from inside the action (it races
// the just-written cookies).

export async function signInAction(_prev: unknown, formData: FormData): Promise<SubmissionResult> {
  const submission = parseWithZod(formData, { schema: signInSchema })
  if (submission.status !== "success") return submission.reply()
  const result = await login(submission.value)
  // Wrong email/password (or any auth failure) — never leak which.
  if (result.error) return submission.reply({ formErrors: ["Invalid email or password."] })
  return submission.reply()
}

export async function signUpAction(_prev: unknown, formData: FormData): Promise<SubmissionResult> {
  const submission = parseWithZod(formData, { schema: signUpSchema })
  if (submission.status !== "success") return submission.reply()
  const result = await register(submission.value)
  if (result.error) return submission.reply({ formErrors: [result.error.message] })
  return submission.reply()
}
