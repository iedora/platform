'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, Field, FieldHint, FieldInput, FieldLabel } from '@iedora/design-system'
import { staffRenameRestaurant } from '../actions'

/**
 * Staff override of a restaurant's friendly name on the admin edit page. Calls
 * the staff rename server action; on success the server component is re-fetched
 * so the new name shows everywhere. Menu content stays owner-scoped — the name
 * is the one identity field staff may correct, and the change is audited.
 */
export function AdminRenameForm({ id, name }: { id: string; name: string }) {
  const t = useTranslations('Admin')
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const trimmed = value.trim()
  const dirty = trimmed !== name.trim()
  const valid = trimmed.length >= 1 && trimmed.length <= 80

  function onSubmit() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await staffRenameRestaurant(id, { name: trimmed })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh() // re-render the server component with the new name
    })
  }

  return (
    <form
      className="space-y-3"
      data-test-id="admin-rename-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <Field>
        <FieldLabel htmlFor="admin-rename-name">{t('edit.friendlyName')}</FieldLabel>
        <FieldInput
          id="admin-rename-name"
          data-test-id="admin-rename-name"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
          maxLength={80}
          required
          error={Boolean(error) || (dirty && !valid)}
          aria-describedby={error ? 'admin-rename-msg' : undefined}
        />
        <FieldHint>{t('edit.friendlyNameHint')}</FieldHint>
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !dirty || !valid}>
          {pending ? t('edit.saving') : t('edit.saveName')}
        </Button>
        {error && (
          <span id="admin-rename-msg" className="text-sm text-[var(--danger)]">
            {error}
          </span>
        )}
        {saved && !error && <span className="text-sm text-[var(--green)]">{t('edit.saved')}</span>}
      </div>
    </form>
  )
}
