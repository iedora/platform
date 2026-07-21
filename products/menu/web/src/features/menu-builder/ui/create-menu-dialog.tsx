'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useActionResult } from './use-action-result'
import { Button } from '@iedora/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@iedora/ui/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldHint,
  FieldInput,
  FieldLabel,
} from '@iedora/ui/components/field'
import { createMenu } from '../actions'

export function CreateMenuDialog({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const { pending, error, run } = useActionResult()
  const t = useTranslations('Restaurant')
  const tc = useTranslations('Common')

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    run(() => createMenu(slug, formData), {
      fallback: 'Could not create menu',
      onSuccess: () => setOpen(false),
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default">{t('newMenu')}</Button>} />
      <DialogContent>
        <DialogHeader>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Menu · New
          </p>
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
            <Button type="submit" variant="default" disabled={pending}>
              {pending ? tc('saving') : tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
