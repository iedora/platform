'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { createItem } from '../actions'
import {
  VariantsEditor,
  cleanVariants,
  type EditableVariant,
} from './variants-editor'

/**
 * Add-item dialog — opens from the "+ Add item" CTA inside a section
 * card. The previous inline form sat at the bottom of each section,
 * which was visually noisy (one form per section) and forced the
 * operator to scroll to the bottom of a long section to add anything.
 *
 * Hot path is still `name + price` — those are the only required
 * fields. Variants (½ dose, alcohol-free, large, …) live in the same
 * shared `<VariantsEditor>` the edit dialog uses, so a bar or tasca
 * operator can seed the priced tiers at insert time instead of saving
 * a half-finished dish and re-opening it to edit. The Variants block
 * starts empty + collapsed under a "+ Add variant" affordance — no
 * room added to the dialog when not in use.
 *
 * `categoryName` is shown as the eyebrow so the operator can see which
 * section they're adding to (relevant on phones where the section
 * header is out of view).
 */
export function AddItemDialog({
  open,
  onOpenChange,
  slug,
  categoryId,
  categoryName,
  currency,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  slug: string
  categoryId: string
  categoryName: string
  currency: string
}) {
  const t = useTranslations('Builder')
  const router = useRouter()
  const [name, setName] = useState('')
  const [priceText, setPriceText] = useState('')
  const [variants, setVariants] = useState<EditableVariant[]>([])
  const [error, setError] = useState<string | null>(null)
  // Which control the current error belongs to, so only the failing field is
  // marked invalid (null = form/variant-level → announced but no field stamp).
  const [errorField, setErrorField] = useState<'name' | 'price' | null>(null)
  // Label of the variant row whose price failed to parse (marks that row).
  const [variantErrorLabel, setVariantErrorLabel] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const nameInputId = `add-item-name-${categoryId}`
  const errId = `add-item-error-${categoryId}`

  // Reset on close runs in the close-side of the onOpenChange handler
  // rather than via useEffect — React's recommended pattern for "tear
  // down ephemeral state on a parent-driven event" since the reset is
  // a consequence of the toggle, not a synchronization.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setName('')
      setPriceText('')
      setVariants([])
      setError(null)
      setErrorField(null)
      setVariantErrorLabel(null)
    }
    onOpenChange(next)
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setErrorField(null)
    setVariantErrorLabel(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('addItemNeedsName'))
      setErrorField('name')
      return
    }
    // Variants drive the price once they exist, so the base price is ignored
    // (and its field is disabled). Only parse/validate it for variant-less dishes.
    const hasVariants = variants.length > 0
    let priceCents = 0
    if (!hasVariants) {
      priceCents = priceText.trim()
        ? Math.round(Number(priceText.replace(',', '.')) * 100)
        : 0
      if (!Number.isFinite(priceCents) || priceCents < 0) {
        setError(t('addItemBadPrice'))
        setErrorField('price')
        return
      }
    }
    const cleaned = cleanVariants(variants)
    if (!cleaned.ok) {
      setError(t('itemBadVariantPrice', { label: cleaned.label }))
      setVariantErrorLabel(cleaned.label)
      return
    }
    startTransition(async () => {
      const res = await createItem(slug, categoryId, {
        name: trimmed,
        priceCents,
        variants: cleaned.variants,
      })
      if (res && 'error' in res) {
        setError(res.error ?? t('addItemFailed'))
        return
      }
      router.refresh()
      // Stay open for batch-entry: clear the fields, refocus name.
      // Variants reset too — most batch entries don't share variants.
      setName('')
      setPriceText('')
      setVariants([])
      const el = document.getElementById(nameInputId) as HTMLInputElement | null
      el?.focus()
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {categoryName}
          </p>
          <DialogTitle>{t('addItemTitle')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={onSubmit}
          className="grid gap-4"
          data-test-id={`menu-add-item-form-${categoryId}`}
        >
          <Field>
            <FieldLabel htmlFor={nameInputId}>{t('addItemName')}</FieldLabel>
            <FieldInput
              id={nameInputId}
              autoFocus
              autoComplete="off"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('addItemNamePlaceholder')}
              error={errorField === 'name'}
              aria-describedby={
                errorField === 'name' ? errId : `${nameInputId}-hint`
              }
              data-test-id={`menu-add-item-name-input-${categoryId}`}
            />
            <FieldHint id={`${nameInputId}-hint`}>{t('addItemNameHint')}</FieldHint>
          </Field>
          <Field>
            <FieldLabel htmlFor={`add-item-price-${categoryId}`}>
              {t('addItemPrice', { currency })}
            </FieldLabel>
            <FieldInput
              id={`add-item-price-${categoryId}`}
              inputMode="decimal"
              placeholder="0.00"
              value={variants.length > 0 ? '' : priceText}
              onChange={(e) => setPriceText(e.target.value)}
              disabled={variants.length > 0}
              error={errorField === 'price'}
              aria-describedby={
                errorField === 'price' ? errId : `add-item-price-${categoryId}-hint`
              }
              data-test-id={`menu-add-item-price-input-${categoryId}`}
            />
            <FieldHint id={`add-item-price-${categoryId}-hint`}>
              {variants.length > 0 ? t('itemPriceVariantsHint') : t('addItemPriceHint')}
            </FieldHint>
          </Field>
          <VariantsEditor
            value={variants}
            onChange={setVariants}
            idPrefix={`menu-add-item-variant-${categoryId}`}
            invalidPriceLabel={variantErrorLabel}
            currency={currency}
          />
          {error && (
            <p
              id={errId}
              role="alert"
              className="text-sm text-primary"
              data-test-id={`menu-add-item-error-${categoryId}`}
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
              data-test-id={`menu-add-item-close-${categoryId}`}
            >
              {t('done')}
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={pending || name.trim().length === 0}
              data-test-id={`menu-add-item-submit-${categoryId}`}
            >
              {pending ? t('saving') : t('addItem')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
