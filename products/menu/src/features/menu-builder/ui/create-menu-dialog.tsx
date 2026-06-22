'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldError,
  FieldHint,
  FieldInput,
  FieldLabel,
} from '@iedora/design-system'
import { createMenu } from '../actions'

export function CreateMenuDialog({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const t = useTranslations('Restaurant')
  const tc = useTranslations('Common')

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const res = await createMenu(slug, formData)
      if (res && 'error' in res) {
        setError(res.error ?? 'Could not create menu')
        return
      }
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="solid">{t('newMenu')}</Button>
      </DialogTrigger>
      <DialogContent eyebrow="Menu · New">
        <DialogHeader>
          <DialogTitle>{t('newMenu')}</DialogTitle>
          <DialogDescription>
            Group categories under a name like &quot;Lunch&quot; or &quot;Dinner&quot;.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field error={Boolean(error)}>
            <FieldLabel htmlFor="menu-name">Name</FieldLabel>
            <FieldInput
              id="menu-name"
              name="name"
              required
              maxLength={80}
              autoFocus
              placeholder="e.g. Lunch, Dinner, Drinks"
              error={Boolean(error)}
              aria-describedby={error ? 'menu-name-msg' : 'menu-name-hint'}
            />
            <FieldHint id="menu-name-hint">
              A menu holds your sections — most restaurants need just one.
            </FieldHint>
            {error && <FieldError id="menu-name-msg">{error}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="submit" variant="solid" disabled={pending}>
              {pending ? tc('saving') : tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
