'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { useTranslations } from 'next-intl'
import { deleteCategory } from '../actions'

/**
 * Category actions sheet. The kebab on each section card opens this
 * dialog showing the destructive + secondary actions in a vertical list
 * — big tap targets, plain text labels, dangerous "Delete" set apart in
 * cinnabar AND behind a confirmation step. We deliberately don't use a
 * popover/menu primitive: a centered dialog is easier to hit on a phone
 * and reads the same on desktop.
 *
 * Translate and Reorder are passed in as render slots so this file
 * doesn't pull dependencies for them — the parent decides whether to
 * surface those rows (Translate only renders when supportedLanguages
 * > 1; Reorder only when items.length > 1).
 */
export function CategoryMenu({
  slug,
  categoryId,
  categoryName,
  onRename,
  onReorder,
  translateSlot,
}: {
  slug: string
  categoryId: string
  categoryName: string
  onRename: () => void
  onReorder?: () => void
  translateSlot?: React.ReactNode
}) {
  const t = useTranslations('Builder')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  function close() {
    setOpen(false)
    setConfirmDelete(false)
  }

  function doRename() {
    setOpen(false)
    // defer so the dialog can finish closing before focus moves
    requestAnimationFrame(onRename)
  }

  function doReorder() {
    setOpen(false)
    if (onReorder) requestAnimationFrame(onReorder)
  }

  function doDelete() {
    startTransition(async () => {
      await deleteCategory(slug, categoryId)
      close()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={t('sectionActionsAria', { name: categoryName })}
            data-test-id={`menu-section-kebab-${categoryId}`}
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
          />
        }
      >
        {/* Three vertical dots — heavier glyph reads better than `⋮` on
            mobile Safari. */}
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="5" r="1.7" fill="currentColor" />
          <circle cx="12" cy="12" r="1.7" fill="currentColor" />
          <circle cx="12" cy="19" r="1.7" fill="currentColor" />
        </svg>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {t('sectionActionsEyebrow')}
          </p>
          <DialogTitle>{categoryName}</DialogTitle>
        </DialogHeader>

        {confirmDelete ? (
          <>
            <DialogDescription>
              {t('deleteSectionConfirm', { name: categoryName })}
            </DialogDescription>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
                disabled={pending}
                data-test-id={`menu-section-delete-cancel-${categoryId}`}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={doDelete}
                disabled={pending}
                data-test-id={`menu-section-delete-confirm-${categoryId}`}
              >
                {pending ? t('deleting') : t('deleteSection')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="grid gap-2">
            <button
              type="button"
              className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-4 py-3.5 text-left text-[15px] font-medium text-foreground transition-colors hover:border-primary hover:bg-muted"
              onClick={doRename}
              data-test-id={`menu-section-action-rename-${categoryId}`}
            >
              {t('renameSection')}
            </button>
            {translateSlot}
            {onReorder && (
              <button
                type="button"
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-4 py-3.5 text-left text-[15px] font-medium text-foreground transition-colors hover:border-primary hover:bg-muted"
                onClick={doReorder}
                data-test-id={`menu-section-action-reorder-${categoryId}`}
              >
                {t('reorderItems')}
              </button>
            )}
            <button
              type="button"
              className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-4 py-3.5 text-left text-[15px] font-medium text-destructive transition-colors hover:border-destructive hover:bg-muted"
              onClick={() => setConfirmDelete(true)}
              data-test-id={`menu-section-action-delete-${categoryId}`}
            >
              {t('deleteSection')}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
