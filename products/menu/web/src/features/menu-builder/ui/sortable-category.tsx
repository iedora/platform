'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FieldInput } from '@iedora/ui/components/field'
import { useTranslations } from 'next-intl'
import type { LanguageCode } from '../../i18n'
import { reorderItems, updateCategoryName } from '../actions'
import { CategoryTranslateDialog } from './category-translate-dialog'
import { CategoryMenu } from './category-menu'
import { AddItemDialog } from './add-item-dialog'
import { SortableItem } from './sortable-item'
import { GripIcon } from './grip-icon'
import type { BuilderCategory, BuilderItem } from './types'

/**
 * Renders one section card: title row + items list + "+ Add item" CTA.
 *
 * Big shifts vs the previous version:
 *   - Header is one row only: title (tap to rename inline) + small
 *     translate button (multi-lang only) + kebab. The destructive
 *     "Delete" lives behind the kebab so a misplaced tap doesn't nuke a
 *     section.
 *   - The inline add-item form is gone. "+ Add item" opens `AddItemDialog`
 *     which keeps the operator focused (one form, two fields).
 *   - Drag handles live on the LEFT and use a real SVG grip glyph.
 *     The whole row is the tap target — the operator drags by the grip,
 *     taps anywhere else to open the item editor.
 *
 * Reorder mode (Phase B candidate): right now drag is always live with
 * an 8px activation distance — safe for click-to-edit. A future "Reorder"
 * toggle behind the kebab can disable click-to-edit for the duration.
 */
export function SortableCategory({
  slug,
  defaultLanguage,
  supportedLanguages,
  category,
}: {
  slug: string
  defaultLanguage: LanguageCode
  supportedLanguages: LanguageCode[]
  category: BuilderCategory
}) {
  const t = useTranslations('Builder')
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id })

  const [items, setItems] = useState<BuilderItem[]>(category.items)
  const [prevItems, setPrevItems] = useState(category.items)
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(category.name)
  const [prevName, setPrevName] = useState(category.name)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  // Sync local state with the server-rendered prop after a mutation
  // triggers router.refresh() upstream. Render-phase update per React's
  // "reset state when a prop changes" recipe — better than useEffect
  // because the new state is visible on the same render.
  if (category.items !== prevItems) {
    setPrevItems(category.items)
    setItems(category.items)
  }
  if (category.name !== prevName) {
    setPrevName(category.name)
    setName(category.name)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const dndId = useId()

  function handleItemDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(items, oldIndex, newIndex)
    setItems(reordered)
    startTransition(async () => {
      await reorderItems(
        slug,
        category.id,
        reordered.map((i) => i.id),
      )
      router.refresh()
    })
  }

  function commitName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === category.name) {
      setName(category.name)
      setEditingName(false)
      return
    }
    startTransition(async () => {
      // The backend update replaces the full text set — carry the untouched
      // fields so a rename doesn't wipe description/translations.
      const res = await updateCategoryName(slug, category.id, {
        name: trimmed,
        description: category.description ?? undefined,
        nameI18n: category.nameI18n ?? undefined,
        descriptionI18n: category.descriptionI18n ?? undefined,
      })
      if (res && 'error' in res) setName(category.name)
      setEditingName(false)
      router.refresh()
    })
  }

  const currency = items[0]?.currency ?? 'EUR'

  return (
    <section
      ref={setNodeRef}
      id={`menu-section-${category.id}`}
      data-section-id={category.id}
      data-test-id={`menu-section-${category.id}`}
      className="overflow-hidden rounded-lg border border-border bg-card scroll-mt-24"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <header className="flex min-h-14 items-center gap-2.5 border-b border-border py-3.5 pl-3.5 pr-3">
        <button
          type="button"
          aria-label={t('dragSection', { name: category.name })}
          data-test-id={`menu-section-grip-${category.id}`}
          className="inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>

        {editingName ? (
          <FieldInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') {
                setName(category.name)
                setEditingName(false)
              }
            }}
            className="h-9 flex-1"
            maxLength={80}
            data-test-id={`menu-section-name-input-${category.id}`}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 cursor-text border-0 bg-transparent py-1 text-left font-heading text-[17px] font-semibold text-foreground hover:underline hover:decoration-border hover:underline-offset-4"
            onClick={() => setEditingName(true)}
            data-test-id={`menu-section-title-${category.id}`}
          >
            {category.name}
          </button>
        )}

        {supportedLanguages.length > 1 && (
          <CategoryTranslateDialog
            slug={slug}
            categoryId={category.id}
            defaultLanguage={defaultLanguage}
            supportedLanguages={supportedLanguages}
            initial={{
              name: category.name,
              description: category.description,
              nameI18n: category.nameI18n,
              descriptionI18n: category.descriptionI18n,
            }}
          />
        )}

        <CategoryMenu
          slug={slug}
          categoryId={category.id}
          categoryName={category.name}
          onRename={() => setEditingName(true)}
        />
      </header>

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleItemDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div>
            {items.length === 0 ? (
              <p className="px-4 py-[18px] text-center text-sm text-muted-foreground">
                {t('emptySection')}
              </p>
            ) : (
              items.map((it) => (
                <SortableItem
                  key={it.id}
                  slug={slug}
                  defaultLanguage={defaultLanguage}
                  supportedLanguages={supportedLanguages}
                  item={it}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        className="flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-1.5 border-0 border-t border-border bg-transparent px-4 py-3.5 text-sm font-semibold text-primary hover:bg-muted"
        onClick={() => setAddItemOpen(true)}
        disabled={pending}
        data-test-id={`menu-section-add-item-${category.id}`}
      >
        <span aria-hidden="true">＋</span>
        <span>{t('addItem')}</span>
      </button>

      <AddItemDialog
        open={addItemOpen}
        onOpenChange={setAddItemOpen}
        slug={slug}
        categoryId={category.id}
        categoryName={category.name}
        currency={currency}
      />
    </section>
  )
}

// GripIcon moved to ./grip-icon (shared with sortable-item).
