import { describe, expect, it } from 'vitest'
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from './schemas'

// ── Regression: no raw Zod type-default may leak to the UI ───────────────────
// Conform's parseWithZod coerces empty/missing form fields to `undefined`, so a
// required `z.string()` fails its TYPE check ("Invalid input: expected string,
// received undefined") before `.min()` runs. The forms render the error through
// next-intl `tf(errs[0])`, so that raw string would surface as a literal key
// path (`Auth.fields.Invalid input: ...`). Every required field must therefore
// carry a type-level message KEY, not just a `.min()` key.

const LEAK = /Invalid input|expected string|received (undefined|null|nan)/i

// First issue per field — that is the one the form renders (errs[0]).
const messagesFor = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown) => {
  const r = schema.safeParse(value)
  const out: Record<string, string> = {}
  if (!r.success) for (const i of r.error!.issues) { const k = String(i.path[0]); if (!(k in out)) out[k] = i.message }
  return out
}

describe('auth form schemas — every required field resolves to an i18n key, never a raw Zod default', () => {
  const cases = [
    { name: 'signIn', schema: signInSchema, expect: { email: 'emailRequired', password: 'passwordRequired' } },
    { name: 'signUp', schema: signUpSchema, expect: { name: 'nameRequired', email: 'emailRequired', password: 'passwordRequired' } },
    { name: 'forgotPassword', schema: forgotPasswordSchema, expect: { email: 'emailRequired' } },
    { name: 'resetPassword', schema: resetPasswordSchema, expect: { password: 'passwordRequired', confirm: 'passwordMismatch' } },
  ] as const

  it.each(cases)('$name: all-missing input yields message keys (the parseWithZod undefined path)', ({ schema, expect: want }) => {
    const msgs = messagesFor(schema, {}) // {} == every field undefined, what Conform submits for an empty form
    for (const [field, key] of Object.entries(want)) {
      expect(msgs[field], `${field} must be the key "${key}"`).toBe(key)
    }
    for (const msg of Object.values(msgs)) {
      expect(msg, `"${msg}" is a raw Zod default leaking to the UI`).not.toMatch(LEAK)
    }
  })

  it('empty strings resolve the same way as undefined (Conform strips empty → undefined)', () => {
    expect(messagesFor(signInSchema, { email: '', password: '' })).toMatchObject({ email: 'emailRequired', password: 'passwordRequired' })
  })

  it('valid input passes', () => {
    expect(signInSchema.safeParse({ email: 'chef@iedora.com', password: 'longenoughpassword' }).success).toBe(true)
  })
})
