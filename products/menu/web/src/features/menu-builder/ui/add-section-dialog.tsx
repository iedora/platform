'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useActionResult } from './use-action-result'
import { Button } from '@iedora/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@iedora/ui/components/ui/dialog'
import {
  Field,
  FieldHint,
  FieldInput,
  FieldLabel,
} from '@iedora/ui/components/field'
import { useTranslations } from 'next-intl'
import { createCategory } from '../actions'

/**
 * Add-section dialog. Single field — section name. Same shape as
 * AddItemDialog so the operator's mental model is "tap +, type a name,
 * save". Keeps focused after Save so they can chain multiple sections
 * (Starters → Mains → Desserts → Drinks in one sitting).
 */
export function AddSectionDialog({
  open,
  onOpenChange,
  slug,
  menuId,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  slug: string
  menuId: string
}) {
  const t = useTranslations('Builder')
  const router = useRouter()
  const [name, setName] = useState('')
  const { pending, error, setError, run } = useActionResult()
  const nameInputId = 'add-section-name'

  // Reset on close inside the close-side of onOpenChange — see the
  // matching note in add-item-dialog.tsx.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setName('')
      setError(null)
    }
    onOpenChange(next)
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('addSectionNeedsName'))
      return
    }
    run(() => createCategory(slug, menuId, trimmed), {
      fallback: t('addSectionFailed'),
      onSuccess: () => {
        router.refresh()
        setName('')
        const el = document.getElementById(nameInputId) as HTMLInputElement | null
        el?.focus()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('addSectionTitle')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={onSubmit}
          className="grid gap-4"
          data-test-id="menu-add-section-form"
        >
          <Field error={Boolean(error)}>
            <FieldLabel htmlFor={nameInputId}>
              {t('addSectionName')}
            </FieldLabel>
            <FieldInput
              id={nameInputId}
              autoFocus
              autoComplete="off"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('addSectionPlaceholder')}
              error={Boolean(error)}
              aria-describedby={error ? `${nameInputId}-msg` : `${nameInputId}-hint`}
              data-test-id="menu-add-section-name-input"
            />
            <FieldHint id={`${nameInputId}-hint`}>{t('addSectionHint')}</FieldHint>
            {error && (
              <p
                id={`${nameInputId}-msg`}
                role="alert"
                className="text-sm text-primary"
                data-test-id="menu-add-section-error"
              >
                {error}
              </p>
            )}
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
              data-test-id="menu-add-section-close"
            >
              {t('done')}
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={pending || name.trim().length === 0}
              data-test-id="menu-add-section-submit"
            >
              {pending ? t('saving') : t('addSection')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
