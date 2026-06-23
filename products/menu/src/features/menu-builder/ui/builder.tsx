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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useTranslations } from 'next-intl'
import type { LanguageCode } from '../../i18n'
import { reorderCategories } from '../actions'
import { SortableCategory } from './sortable-category'
import { SectionChips } from './section-chips'
import { AddSectionDialog } from './add-section-dialog'
import type { BuilderCategory } from './types'

/**
 * Restaurant menu editor — top-level shell.
 *
 * The redesign organises the surface as a real app:
 *
 *   1. Sticky horizontal chip nav      — tap to jump to any section.
 *   2. Stacked section cards            — each card has its own kebab
 *                                         (Rename / Translate / Delete)
 *                                         and a "+ Add item" CTA at the
 *                                         bottom.
 *   3. Quiet dotted "+ Add section"     — bottom of the page.
 *
 * The chip nav doubles as a visual table of contents — operators with
 * 25–40 dishes across 4–6 sections can scan the whole menu without
 * scrolling. IntersectionObserver in `SectionChips` keeps the chip
 * matching whichever section is currently in view.
 *
 * Every interactive element here is at least 44px tall. No inline
 * forms sit at the bottom of every section like before; "+ Add item"
 * opens a focused dialog so the operator's hot path is two taps
 * (tap +, type name, save → repeat).
 */
export function MenuBuilder({
  slug,
  menuId,
  defaultLanguage,
  supportedLanguages,
  initialCategories,
}: {
  slug: string
  menuId: string
  defaultLanguage: LanguageCode
  supportedLanguages: LanguageCode[]
  initialCategories: BuilderCategory[]
}) {
  const t = useTranslations('Builder')
  const router = useRouter()
  const [categories, setCategories] = useState<BuilderCategory[]>(initialCategories)
  const [prevInitial, setPrevInitial] = useState(initialCategories)
  const [addSectionOpen, setAddSectionOpen] = useState(false)
  // Desktop two-column model (Pencil z00eAs): the left rail selects a category
  // and the right column shows only that one. Mobile keeps the stacked + chip
  // layout. Cards stay mounted either way, so drag/edit state is never torn down.
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCategories[0]?.id ?? null,
  )
  const [, startTransition] = useTransition()

  // Sync local state with the server-rendered prop after mutations —
  // render-phase update is the React-recommended pattern for "reset on
  // prop change". See https://react.dev/learn/you-might-not-need-an-effect.
  if (initialCategories !== prevInitial) {
    setPrevInitial(initialCategories)
    setCategories(initialCategories)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const dndId = useId()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = categories.findIndex((c) => c.id === active.id)
    const newIndex = categories.findIndex((c) => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(categories, oldIndex, newIndex)
    setCategories(reordered) // optimistic
    startTransition(async () => {
      await reorderCategories(
        slug,
        menuId,
        reordered.map((c) => c.id),
      )
      router.refresh()
    })
  }

  // The selected category on desktop; falls back to the first when the
  // selection was deleted.
  const activeId = categories.some((c) => c.id === selectedId)
    ? selectedId
    : (categories[0]?.id ?? null)

  return (
    <div className="space-y-4">
      {/* Mobile: sticky chip nav (jumps between stacked sections). */}
      {categories.length > 0 && (
        <div className="lg:hidden">
          <SectionChips
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            addLabel={t('addSection')}
            onAddSection={() => setAddSectionOpen(true)}
          />
        </div>
      )}

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={categories.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {categories.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] p-8 text-center">
              <p
                className="text-base text-[var(--foreground)] mb-4"
                data-test-id="menu-builder-empty"
              >
                {t('emptyMenu')}
              </p>
              <button
                type="button"
                className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary/45 bg-transparent p-4 text-sm font-semibold text-primary hover:border-primary hover:bg-primary/[0.06]"
                onClick={() => setAddSectionOpen(true)}
                data-test-id="menu-builder-add-section-empty"
              >
                <span aria-hidden="true">＋</span>
                <span>{t('addFirstSection')}</span>
              </button>
            </div>
          ) : (
            <div className="lg:grid lg:grid-cols-[240px_1fr] lg:items-start lg:gap-6">
              {/* Desktop: category rail (select one → see its items). */}
              <nav className="hidden lg:flex lg:flex-col lg:gap-1 lg:sticky lg:top-4">
                {categories.map((c) => {
                  const isActive = c.id === activeId
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      aria-current={isActive ? 'true' : undefined}
                      data-test-id={`menu-section-rail-${c.id}`}
                      className={
                        'flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-[14px] font-medium transition-colors ' +
                        (isActive
                          ? 'bg-primary text-white'
                          : 'text-foreground hover:bg-muted')
                      }
                    >
                      <span className="truncate">{c.name}</span>
                      <span
                        className={
                          'shrink-0 text-[12px] ' +
                          (isActive ? 'text-white/75' : 'text-muted-foreground')
                        }
                      >
                        {c.items.length}
                      </span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setAddSectionOpen(true)}
                  data-test-id="menu-builder-add-section-rail"
                  className="mt-1 flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-left text-[14px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <span aria-hidden="true">＋</span>
                  <span>{t('addSection')}</span>
                </button>
              </nav>

              {/* Cards: all mounted; mobile shows every one, desktop only the
                  selected (so drag/edit state is preserved across selection). */}
              <div className="min-w-0 space-y-4">
                {categories.map((c) => (
                  <div
                    key={c.id}
                    className={c.id === activeId ? 'lg:block' : 'lg:hidden'}
                  >
                    <SortableCategory
                      slug={slug}
                      defaultLanguage={defaultLanguage}
                      supportedLanguages={supportedLanguages}
                      category={c}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </SortableContext>
      </DndContext>

      {/* Mobile: add-section CTA at the bottom (desktop uses the rail). */}
      {categories.length > 0 && (
        <button
          type="button"
          className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary/45 bg-transparent p-4 text-sm font-semibold text-primary hover:border-primary hover:bg-primary/[0.06] lg:hidden"
          onClick={() => setAddSectionOpen(true)}
          data-test-id="menu-builder-add-section"
        >
          <span aria-hidden="true">＋</span>
          <span>{t('addSection')}</span>
        </button>
      )}

      <AddSectionDialog
        open={addSectionOpen}
        onOpenChange={setAddSectionOpen}
        slug={slug}
        menuId={menuId}
      />
    </div>
  )
}
