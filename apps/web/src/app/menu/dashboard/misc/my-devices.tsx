'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { SessionView } from '@iedora/auth-sdk'
import { deviceLabel } from '@iedora/product-menu/shared/device-label'
import { listMyDevicesAction, revokeMyDeviceAction } from '@iedora/product-menu/features/account/actions'
import { Button } from '@iedora/ui/components/ui/button'

/**
 * The owner's own logged-in devices. Read-only list of the live sessions plus a
 * "sign out everywhere else" control (revokes every device but this one). Kicking
 * a single specific device is an admin-only control (it needs to know which
 * session is the caller's).
 */
export function MyDevices() {
  const t = useTranslations('Misc.devices')
  const [devices, setDevices] = useState<SessionView[] | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    listMyDevicesAction()
      .then(setDevices)
      .catch(() => setDevices([]))
  }, [])

  const live = (devices ?? []).filter((d) => d.current)

  function signOutOthers() {
    start(async () => {
      await revokeMyDeviceAction('*')
      setDevices(await listMyDevicesAction().catch(() => []))
    })
  }

  if (devices === null) {
    return <p className="py-2 text-[14px] text-muted-foreground">{t('loading')}</p>
  }
  if (live.length === 0) {
    return <p className="py-2 text-[14px] text-muted-foreground">{t('empty')}</p>
  }

  return (
    <div className="space-y-3" data-test-id="my-devices">
      <ul className="grid grid-cols-1 gap-2">
        {live.map((d) => (
          <li key={d.family} className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-card p-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-foreground">{deviceLabel(d.userAgent)}</p>
              <p className="truncate font-mono text-[12.5px] text-muted-foreground">{d.ip ?? t('ipUnknown')}</p>
            </div>
            <span className="shrink-0 text-[12px] text-green-700">{t('active')}</span>
          </li>
        ))}
      </ul>
      {live.length > 1 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="!rounded-full normal-case tracking-normal"
          disabled={pending}
          onClick={signOutOthers}
          data-test-id="sign-out-others"
        >
          {pending ? t('signingOut') : t('signOutOthers')}
        </Button>
      ) : null}
    </div>
  )
}
