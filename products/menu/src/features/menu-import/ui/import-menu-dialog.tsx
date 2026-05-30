'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
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
} from '@iedora/design-system'

// Wizard is 800+ LOC + AI / image-parse deps. Most restaurant pages
// never trigger import (operators land on a populated menu). Pull it
// out of the initial chunk; the radix `<Dialog>` unmounts children
// when closed, so the bundle is only fetched on first open.
const MenuImportWizard = dynamic(
  () => import('./menu-import-wizard').then((m) => m.MenuImportWizard),
)

/**
 * Restaurant-page trigger + dialog around `<MenuImportWizard>`. The
 * wizard owns the upload + AI parse + edit logic; this wrapper layers
 * on:
 *   - the Radix dialog chrome
 *   - the contextual "Menu imported! 🎉" success card with an
 *     "Open menu" CTA that drops the operator straight into the
 *     menu builder
 *
 * Onboarding doesn't use this wrapper — it composes the wizard inline
 * on `/onboarding/menu/[slug]` so the success path is a redirect to
 * `/dashboard` rather than the in-restaurant builder.
 */
export function ImportMenuDialog({
  slug,
  restaurantId,
}: {
  slug: string
  restaurantId: string
}) {
  const t = useTranslations('Restaurant')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [importedMenuId, setImportedMenuId] = useState<string | null>(null)

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setImportedMenuId(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          data-test-id="import-menu-trigger"
        >
          {t('importMenu')}
        </Button>
      </DialogTrigger>

      <DialogContent eyebrow="Menu · AI import">
        {importedMenuId === null ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('importMenuTitle')}</DialogTitle>
              <DialogDescription>
                {t('importMenuDescription')}
              </DialogDescription>
            </DialogHeader>

            <div className="py-2">
              <MenuImportWizard
                slug={slug}
                restaurantId={restaurantId}
                onImported={(menuId) => setImportedMenuId(menuId)}
              />
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('importMenuSuccessTitle')}</DialogTitle>
              <DialogDescription>
                {t('importMenuSuccessDescription')}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                data-test-id="import-menu-close"
              >
                {/* The dialog's "close" doubles as the dismiss handle. */}
                ✕
              </Button>
              <Button
                type="button"
                variant="solid"
                onClick={() => {
                  onOpenChange(false)
                  router.push(`/dashboard/r/${slug}/m/${importedMenuId}`)
                  router.refresh()
                }}
                data-test-id="import-menu-open"
              >
                {t('importMenuSuccessOpen')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
