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
  DialogTrigger,
} from '@iedora/ui/components/ui/dialog'
import { LocalizedFields } from '../../i18n/ui/localized-fields'
import type { LanguageCode, LocalizedText } from '../../i18n'
import { updateCategoryTranslations } from '../actions'

// Opens from a "Translate" button next to the category title. Renders only
// when supportedLanguages.length > 1 — single-language menus keep the inline
// rename UX they already had.
export function CategoryTranslateDialog({
  slug,
  categoryId,
  defaultLanguage,
  supportedLanguages,
  initial,
}: {
  slug: string
  categoryId: string
  defaultLanguage: LanguageCode
  supportedLanguages: LanguageCode[]
  initial: {
    name: string
    description: string | null
    nameI18n: LocalizedText | null
    descriptionI18n: LocalizedText | null
  }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description ?? '')
  const [nameI18n, setNameI18n] = useState<LocalizedText>(initial.nameI18n ?? {})
  const [descriptionI18n, setDescriptionI18n] = useState<LocalizedText>(
    initial.descriptionI18n ?? {},
  )
  const { pending, error, run } = useActionResult()
  const [nameError, setNameError] = useState<string | null>(null)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNameError(null)
    if (!name.trim()) {
      setNameError('Name is required.')
      return
    }
    run(
      () =>
        updateCategoryTranslations(slug, categoryId, {
          name: name.trim(),
          description: description.trim(),
          nameI18n,
          descriptionI18n,
        }),
      {
        fallback: 'Could not save',
        onSuccess: () => {
          setOpen(false)
          router.refresh()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" data-testid={`category-translate-${categoryId}`} />}
      >
        Translate
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Edit category</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <LocalizedFields
            id="category"
            defaultLanguage={defaultLanguage}
            supportedLanguages={supportedLanguages}
            name={name}
            onNameChange={setName}
            description={description}
            onDescriptionChange={setDescription}
            nameI18n={nameI18n}
            onNameI18nChange={setNameI18n}
            descriptionI18n={descriptionI18n}
            onDescriptionI18nChange={setDescriptionI18n}
            nameMaxLength={80}
            nameError={nameError ?? undefined}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={pending}
              data-testid="category-translate-save"
            >
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
