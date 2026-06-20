'use client'

import * as React from 'react'
import { useId, useState } from 'react'
import { AlertCircle, ChevronDown, Eye, EyeOff } from 'lucide-react'

/**
 * Warm-light form-field primitives (Pencil "Input Field" / "Password Field" /
 * "Select Field" + the error state). Every form across the app composes these
 * instead of hand-rolling inputs, so the label rhythm, focus ring, error
 * styling, and a11y wiring live in one place.
 *
 *   <TextField label="Email" name="email" type="email" error={errors.email} />
 *   <PasswordField label="Password" name="password" error={errors.password} />
 *   <SelectField label="Language" name="lang" error={errors.lang}>…options…</SelectField>
 */

const LABEL = 'mb-1.5 block text-[14px] font-semibold text-foreground'
const RING_OK =
  'focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cinnabar)_22%,transparent)]'
const RING_OK_WITHIN =
  'focus-within:border-primary focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--cinnabar)_22%,transparent)]'
const RING_ERR = 'border-[#D92D20] focus:ring-2 focus:ring-[color-mix(in_srgb,#D92D20_20%,transparent)]'
const RING_ERR_WITHIN =
  'border-[#D92D20] focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,#D92D20_20%,transparent)]'

/** A standalone control (input / select). */
function inputClass(error?: boolean): string {
  return `w-full rounded-[12px] border bg-card px-4 py-3 text-[16px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground ${error ? RING_ERR : `border-border ${RING_OK}`}`
}
/** A control wrapped in a box (input + adornment). */
function boxClass(error?: boolean): string {
  return `flex w-full items-center rounded-[12px] border bg-card transition-[border-color,box-shadow] ${error ? RING_ERR_WITHIN : `border-border ${RING_OK_WITHIN}`}`
}

/** Error (red + alert icon) or hint (muted) under a field. */
export function FieldMessage({ id, error, hint }: { id?: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p id={id} role="alert" data-test-id="field-error" className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[#D92D20]">
        <AlertCircle size={13} strokeWidth={2.4} className="shrink-0" />
        {error}
      </p>
    )
  }
  if (hint) return <p id={id} className="mt-1.5 text-[13px] text-muted-foreground">{hint}</p>
  return null
}

type TextFieldProps = {
  label: string
  error?: string
  hint?: string
} & React.InputHTMLAttributes<HTMLInputElement>

export function TextField({ label, error, hint, id, ...rest }: TextFieldProps) {
  const auto = useId()
  const fieldId = id ?? rest.name ?? auto
  const msgId = `${fieldId}-msg`
  return (
    <div>
      <label htmlFor={fieldId} className={LABEL}>{label}</label>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? msgId : undefined}
        className={inputClass(!!error)}
        {...rest}
      />
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  )
}

type PasswordFieldProps = {
  label: string
  error?: string
  hint?: string
  /** aria-labels for the visibility toggle (i18n). */
  showLabel?: string
  hideLabel?: string
} & React.InputHTMLAttributes<HTMLInputElement>

export function PasswordField({
  label,
  error,
  hint,
  showLabel = 'Show password',
  hideLabel = 'Hide password',
  id,
  ...rest
}: PasswordFieldProps) {
  const auto = useId()
  const fieldId = id ?? rest.name ?? auto
  const msgId = `${fieldId}-msg`
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={fieldId} className={LABEL}>{label}</label>
      <div className={`${boxClass(!!error)} gap-1 pr-1.5`}>
        <input
          id={fieldId}
          type={show ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? hideLabel : showLabel}
          aria-pressed={show}
          tabIndex={-1}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          data-test-id="password-toggle"
        >
          {show ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
        </button>
      </div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  )
}

type SelectFieldProps = {
  label: string
  error?: string
  hint?: string
} & React.SelectHTMLAttributes<HTMLSelectElement>

export function SelectField({ label, error, hint, id, children, ...rest }: SelectFieldProps) {
  const auto = useId()
  const fieldId = id ?? rest.name ?? auto
  const msgId = `${fieldId}-msg`
  return (
    <div>
      <label htmlFor={fieldId} className={LABEL}>{label}</label>
      <div className="relative">
        <select
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          className={`${inputClass(!!error)} appearance-none pr-10`}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  )
}
