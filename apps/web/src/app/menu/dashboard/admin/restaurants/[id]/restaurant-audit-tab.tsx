'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AuditRecord } from '@iedora/product-menu/shared/api'
import { loadRestaurantAuditAction } from '@iedora/product-menu/features/restaurant-identity/actions'
import { Button } from '@iedora/ui/components/ui/button'
import { AuditLog } from './audit-log'

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; events: AuditRecord[] }

/**
 * Lazy Activity tab. Base UI's Tabs.Panel unmounts inactive panels, so this
 * component (and its fetch) mounts only when the admin opens Activity — the
 * audit DB is never touched on a plain record view. Re-fetches if the panel is
 * reopened (cheap, index-backed) but de-dupes within a single mount.
 */
export function RestaurantAuditTab({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations('Admin')
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    loadRestaurantAuditAction(restaurantId)
      .then((events) => {
        if (!cancelled) setState({ status: 'ready', events })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [restaurantId, attempt])

  if (state.status === 'loading') {
    return (
      <p className="py-3 text-[14px] text-muted-foreground" data-test-id="admin-audit-loading">
        {t('audit.loading')}
      </p>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-2 py-3" data-test-id="admin-audit-error">
        <p className="text-[14px] text-destructive">{t('audit.error')}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          {t('audit.retry')}
        </Button>
      </div>
    )
  }

  return <AuditLog events={state.events} />
}
