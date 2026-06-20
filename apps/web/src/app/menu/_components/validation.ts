// Shared client-side form validation — the auth + onboarding forms build
// their per-field error maps from these, surfaced through the form-field
// components. The server actions re-validate (security); this is for fast,
// friendly feedback before the round-trip.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PASSWORD_MIN = 12

export const isEmail = (value: string): boolean => EMAIL_RE.test(value.trim())
