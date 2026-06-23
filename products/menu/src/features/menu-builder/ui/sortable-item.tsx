'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@iedora/ui/components/ui/button'
import { Checkbox } from '@iedora/ui/components/ui/checkbox'
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
  FieldTextarea,
} from '@iedora/ui/components/field'
import { SectionHeader } from '@iedora/ui/components/section-header'
import { useTranslations } from 'next-intl'
import { formatPrice } from '../../../shared/format'
import { ImageUpload } from '../../upload/ui/image-upload'
import type { LanguageCode, LocalizedText } from '../../i18n'
import { deleteItem, updateItem } from '../actions'
import type { BuilderItem, BuilderVariant } from './types'
import {
  VariantsEditor,
  cleanVariants,
  type EditableVariant,
} from './variants-editor'
import { ItemTranslations } from './item-translations'

/**
 * Item row + edit dialog.
 *
 * Row design:
 *   - Whole row is one tap target → open the edit dialog. The previous
 *     version split the row into a grip area and a click area, which
 *     was unreliable on touch (mis-taps hit the grip).
 *   - Grip is on the LEFT, an SVG glyph not unicode, with `cursor: grab`
 *     and `min-width: 28px`. Drag activation is gated by an 8px move
 *     threshold so a tap can't be misread as a drag.
 *   - Price column: hides "€0.00" — shows the localised "no price" hint
 *     in ink-40 italics instead, so the row doesn't lie about prices
 *     the operator hasn't entered.
 *   - Description shows truncated under the name on one line; variants
 *     pill-row below for items with 2+ doses.
 *
 * Edit dialog design:
 *   - Two stacked groups. The top "basics" (name, price, photo,
 *     available) is what the operator touches 90% of the time. The
 *     "More options" disclosure expands description, variants,
 *     translations, and delete.
 *   - On desktop both can be open simultaneously; on mobile the
 *     disclosure keeps the form short enough to fit the viewport without
 *     internal scrolling.
 */

function variantsToEditable(
  variants: ReadonlyArray<BuilderVariant>,
): EditableVariant[] {
  return variants.map((v) => ({
    label: v.label,
    labelI18n: v.labelI18n,
    priceText: v.priceCents > 0 ? (v.priceCents / 100).toFixed(2) : '',
  }))
}

export function SortableItem({
  slug,
  defaultLanguage,
  supportedLanguages,
  item,
}: {
  slug: string
  defaultLanguage: LanguageCode
  supportedLanguages: LanguageCode[]
  item: BuilderItem
}) {
  const t = useTranslations('Builder')
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const [open, setOpen] = useState(false)
  const [name, setName] = useState(item.name)
  const [description, setDescription] = useState(item.description ?? '')
  const [nameI18n, setNameI18n] = useState<LocalizedText>(
    () => item.nameI18n ?? {},
  )
  const [descriptionI18n, setDescriptionI18n] = useState<LocalizedText>(
    () => item.descriptionI18n ?? {},
  )
  const [priceText, setPriceText] = useState(
    item.priceCents > 0 ? (item.priceCents / 100).toFixed(2) : '',
  )
  const [available, setAvailable] = useState(item.available)
  const [variants, setVariants] = useState<EditableVariant[]>(() =>
    variantsToEditable(item.variants),
  )
  const [imageUrl, setImageUrl] = useState<string | null>(item.imageUrl)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Which control the current error belongs to, so only the failing field is
  // marked invalid (null = form/variant-level → announced but no field stamp).
  const [errorField, setErrorField] = useState<'name' | 'price' | null>(null)
  // Label of the variant row whose price failed to parse (marks that row).
  const [variantErrorLabel, setVariantErrorLabel] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const errId = `item-error-${item.id}`

  // Reset local state when reopening so it tracks server truth.
  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setConfirmDelete(false)
      setError(null)
      setErrorField(null)
      setVariantErrorLabel(null)
    } else {
      setName(item.name)
      setDescription(item.description ?? '')
      setNameI18n(item.nameI18n ?? {})
      setDescriptionI18n(item.descriptionI18n ?? {})
      setPriceText(item.priceCents > 0 ? (item.priceCents / 100).toFixed(2) : '')
      setAvailable(item.available)
      setVariants(variantsToEditable(item.variants))
      setImageUrl(item.imageUrl)
    }
  }

  function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setErrorField(null)
    setVariantErrorLabel(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('itemNeedsName'))
      setErrorField('name')
      return
    }
    const priceCents = priceText.trim()
      ? Math.round(Number(priceText.replace(',', '.')) * 100)
      : 0
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setError(t('itemBadPrice'))
      setErrorField('price')
      return
    }

    const cleaned = cleanVariants(variants)
    if (!cleaned.ok) {
      setError(t('itemBadVariantPrice', { label: cleaned.label }))
      setVariantErrorLabel(cleaned.label)
      return
    }

    startTransition(async () => {
      const res = await updateItem(slug, item.id, {
        name: trimmed,
        description: description.trim(),
        priceCents,
        available,
        nameI18n,
        descriptionI18n,
        variants: cleaned.variants,
      })
      if (res && 'error' in res) {
        setError(res.error ?? t('itemSaveFailed'))
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  function doDelete() {
    startTransition(async () => {
      await deleteItem(slug, item.id)
      setOpen(false)
      router.refresh()
    })
  }

  const showPrice = item.priceCents > 0
  const formattedPrice = showPrice ? formatPrice(item.priceCents, item.currency) : null
  const hasMultiLanguage = supportedLanguages.length > 1

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        className="group flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 border-t border-border bg-transparent px-3.5 py-3 text-left text-foreground transition-colors first:border-t-0 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary data-[unavailable=true]:opacity-[0.55]"
        onClick={() => onOpenChange(true)}
        data-test-id={`menu-item-row-${item.id}`}
        data-unavailable={item.available ? 'false' : 'true'}
      >
        <span
          className="inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          aria-label={t('dragItem', { name: item.name })}
          data-test-id={`menu-item-grip-${item.id}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </span>
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            data-testid={`item-thumb-${item.id}`}
            className="h-[52px] w-[52px] shrink-0 rounded-md object-cover"
          />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 overflow-hidden text-ellipsis font-heading text-[15px] font-semibold leading-[1.3] group-data-[unavailable=true]:text-muted-foreground group-data-[unavailable=true]:line-through">
            {item.name}
          </span>
          {item.description && (
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-muted-foreground">
              {item.description}
            </span>
          )}
          {item.variants.length > 0 && (
            <span
              className="mt-1 flex flex-wrap gap-1.5"
              data-test-id={`item-variants-${item.id}`}
            >
              {item.variants.map((v, vi) => (
                <span
                  key={`${v.label}-${vi}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  <span>{v.label}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums text-foreground">
                    {formatPrice(v.priceCents, item.currency)}
                  </span>
                </span>
              ))}
            </span>
          )}
        </span>
        <span
          className={
            showPrice
              ? 'ml-1.5 shrink-0 tabular-nums text-[15px] font-semibold text-foreground'
              : 'ml-1.5 shrink-0 tabular-nums text-[13px] font-normal italic text-muted-foreground'
          }
        >
          {formattedPrice ?? t('noPrice')}
        </span>
        <span
          className={
            'ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap before:h-1.5 before:w-1.5 before:rounded-full before:bg-current before:content-[""] ' +
            (item.available
              ? 'text-green-700 bg-green-100'
              : 'text-muted-foreground bg-muted')
          }
          data-test-id={`menu-item-status-${item.id}`}
        >
          {item.available ? t('itemAvailable') : t('itemHidden')}
        </span>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t('itemEditEyebrow')}
            </p>
            <DialogTitle>{t('editItem')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={onSave}
            className="grid gap-6"
            data-test-id={`menu-item-edit-form-${item.id}`}
          >
            {/* ─── Part 1 · Dish ─────────────────────────────────────
                The basics every dish needs: name + description in the
                source/default language, price, availability, photo.
                Description always lives here (source) — translations
                of it live in Part 3 alongside the name translations. */}
            <section className="grid gap-4" data-test-id={`menu-item-part-dish-${item.id}`}>
              <SectionHeader title={t('partDishTitle')} hint={t('partDishHint')} />
              <Field>
                <FieldLabel htmlFor={`item-name-${item.id}`}>
                  {t('itemName')}
                </FieldLabel>
                <FieldInput
                  id={`item-name-${item.id}`}
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder={t('itemName')}
                  error={errorField === 'name'}
                  aria-describedby={
                    errorField === 'name' ? errId : `item-name-${item.id}-hint`
                  }
                  data-test-id={`menu-item-name-input-${item.id}`}
                />
                <FieldHint id={`item-name-${item.id}-hint`}>
                  {t('itemNameHint')}
                </FieldHint>
              </Field>
              <Field>
                <FieldLabel htmlFor={`item-desc-${item.id}`}>
                  {t('itemDescription')}
                </FieldLabel>
                <FieldTextarea
                  id={`item-desc-${item.id}`}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('itemDescriptionPlaceholder')}
                  aria-describedby={`item-desc-${item.id}-hint`}
                  data-test-id={`menu-item-desc-input-${item.id}`}
                />
                <FieldHint id={`item-desc-${item.id}-hint`}>
                  {t('itemDescriptionHint')}
                </FieldHint>
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`item-price-${item.id}`}>
                    {t('itemPrice', { currency: item.currency })}
                  </FieldLabel>
                  <FieldInput
                    id={`item-price-${item.id}`}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={priceText}
                    onChange={(e) => setPriceText(e.target.value)}
                    error={errorField === 'price'}
                    aria-describedby={
                      errorField === 'price' ? errId : `item-price-${item.id}-hint`
                    }
                    data-test-id={`menu-item-price-input-${item.id}`}
                  />
                  <FieldHint id={`item-price-${item.id}-hint`}>
                    {t('itemPriceHint')}
                  </FieldHint>
                </Field>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={available}
                      onCheckedChange={(checked) => setAvailable(checked)}
                      data-test-id={`menu-item-available-${item.id}`}
                    />
                    <span>{t('itemAvailable')}</span>
                  </label>
                </div>
              </div>
              <Field>
                <FieldLabel>{t('itemPhoto')}</FieldLabel>
                <ImageUpload
                  target={{ kind: 'item-photo', slug, itemId: item.id }}
                  currentUrl={imageUrl}
                  label={t('itemPhoto')}
                  onChange={(url) => {
                    setImageUrl(url)
                    router.refresh()
                  }}
                />
              </Field>
            </section>

            {/* ─── Part 2 · Variants ────────────────────────────────
                Operator-defined priced tiers — ½ dose, alcohol-free,
                large… labels are in the default language (Part 3 will
                translate them once variant-i18n lands). */}
            <section data-test-id={`menu-item-part-variants-${item.id}`}>
              <SectionHeader
                title={t('partVariantsTitle')}
                hint={t('partVariantsHint')}
              />
              <div className="mt-3">
                <VariantsEditor
                  value={variants}
                  onChange={setVariants}
                  idPrefix={`item-variant-${item.id}`}
                  invalidPriceLabel={variantErrorLabel}
                />
              </div>
            </section>

            {/* ─── Part 3 · Translations ─────────────────────────────
                Only rendered for multi-language restaurants. The
                default language is intentionally hidden — its values
                are the source-of-truth edited in Part 1 (name +
                description) and Part 2 (variant labels). Operators see
                the source value above each translation field so they
                don't have to flip tabs to know what they're translating. */}
            {hasMultiLanguage && (
              <section
                className="grid gap-4"
                data-test-id={`menu-item-part-translations-${item.id}`}
              >
                <SectionHeader
                  title={t('partTranslationsTitle')}
                  hint={t('partTranslationsHint')}
                />
                <ItemTranslations
                  itemId={item.id}
                  defaultLanguage={defaultLanguage}
                  supportedLanguages={supportedLanguages}
                  name={name}
                  description={description}
                  variants={variants}
                  nameI18n={nameI18n}
                  descriptionI18n={descriptionI18n}
                  onNameI18nChange={setNameI18n}
                  onDescriptionI18nChange={setDescriptionI18n}
                  onVariantsChange={setVariants}
                />
              </section>
            )}

            {/* ─── Part 4 · Danger zone (delete) ────────────────────
                Quiet by default, accented on confirm. Sits alone at
                the bottom so an accidental tap can't reach it during
                normal editing. */}
            <section
              className="border-t border-[var(--border)] pt-4"
              data-test-id={`menu-item-part-danger-${item.id}`}
            >
              {confirmDelete ? (
                <div className="flex flex-col gap-3 border border-primary p-3">
                  <p className="text-sm">
                    {t('itemDeleteConfirm', { name: item.name })}
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmDelete(false)}
                      disabled={pending}
                      data-test-id={`menu-item-delete-cancel-${item.id}`}
                    >
                      {t('cancel')}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={doDelete}
                      disabled={pending}
                      data-test-id={`menu-item-delete-confirm-${item.id}`}
                    >
                      {pending ? t('deleting') : t('deleteItem')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmDelete(true)}
                  className="justify-self-start text-primary"
                  data-test-id={`menu-item-delete-${item.id}`}
                >
                  {t('deleteItem')}
                </Button>
              )}
            </section>

            {error && (
              <p
                id={errId}
                role="alert"
                className="text-sm text-primary"
                data-test-id={`menu-item-error-${item.id}`}
              >
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={pending}
                data-test-id={`menu-item-cancel-${item.id}`}
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                variant="default"
                disabled={pending}
                data-test-id={`menu-item-save-${item.id}`}
              >
                {pending ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="6" r="1.5" fill="currentColor" />
      <circle cx="15" cy="6" r="1.5" fill="currentColor" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <circle cx="9" cy="18" r="1.5" fill="currentColor" />
      <circle cx="15" cy="18" r="1.5" fill="currentColor" />
    </svg>
  )
}
