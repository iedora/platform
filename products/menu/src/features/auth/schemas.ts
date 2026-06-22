import { z } from 'zod'

/** Min password length the sign-up form enforces (client + server). */
export const PASSWORD_MIN = 12

/**
 * Auth FORM schemas, shared by the Conform forms (apps/web) and their
 * server actions (this package) so ONE schema validates on both sides —
 * no client/server drift, no hand-rolled `validate()`.
 *
 * Validation messages are i18n KEYS under `Auth.fields.<key>`: the form
 * resolves them through next-intl, so the shared schema stays locale-free
 * and the messages translate (EN/PT). Every check carries a key so a raw
 * Zod default never leaks to the UI.
 *
 * Distinct from the `@iedora/contracts` auth schemas, which are the looser
 * service wire contracts the auth service validates — this is the form/UX
 * layer (e.g. the 12-char product password policy).
 */
export const signInSchema = z.object({
  email: z.string().min(1, 'emailRequired').email('emailInvalid'),
  password: z.string().min(1, 'passwordRequired'),
})
export type SignInInput = z.infer<typeof signInSchema>

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'nameRequired'),
  email: z.string().min(1, 'emailRequired').email('emailInvalid'),
  password: z.string().min(PASSWORD_MIN, 'passwordMin'),
})
export type SignUpInput = z.infer<typeof signUpSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'emailRequired').email('emailInvalid'),
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN, 'passwordMin'),
    confirm: z.string(),
  })
  // Mismatch attaches to the confirm field (key resolved via Auth.fields).
  .refine((d) => d.password === d.confirm, { message: 'passwordMismatch', path: ['confirm'] })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
