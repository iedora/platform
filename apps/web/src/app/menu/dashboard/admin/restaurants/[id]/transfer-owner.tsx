'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@iedora/ui/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@iedora/ui/components/ui/tabs'
import { FieldMessage, SelectField, TextField } from '@iedora/ui/components/field'
import {
  listTransferTargetsAction,
  staffTransferOwnershipAction,
  transferEligibilityAction,
} from '@iedora/product-menu/features/restaurant-identity/actions'
import { useDebouncedAction } from '../../../../_components/use-debounced-action'

type Target = { id: string; name: string; ownerEmail: string }

/**
 * Inline (mobile-first, no modal) "transfer ownership" panel on the Owner card.
 * Two modes — move this restaurant to an existing tenant (plan-gated, with live
 * eligibility), or create a new user who receives the whole tenant. Built on the
 * @iedora/ui shadcn (Base UI) kit; the create-user logic lives once in the auth
 * service. On success the server component re-fetches so the new owner + audit
 * entry show immediately.
 */
export function TransferOwner({
  restaurantId,
  currentTenantId,
}: {
  restaurantId: string
  currentTenantId?: string
}) {
  const t = useTranslations('Admin.transfer')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [tenantId, setTenantId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Lazy-load candidate tenants the first time the panel opens.
  function expand() {
    setOpen(true)
    if (targets === null) {
      void listTransferTargetsAction().then((ts) =>
        setTargets(ts.filter((x) => x.id !== currentTenantId)),
      )
    }
  }

  // Live plan-capacity check for the chosen target (existing mode only).
  const elig = useDebouncedAction(mode === 'existing' ? tenantId : '', transferEligibilityAction)

  const canSubmit =
    !pending &&
    (mode === 'existing'
      ? Boolean(tenantId) && elig?.eligible === true
      : name.trim().length > 0 && email.trim().length > 3 && password.length >= 12)

  function submit() {
    setError(null)
    startTransition(async () => {
      const input =
        mode === 'existing'
          ? ({ mode: 'existing', tenantId } as const)
          : ({ mode: 'new', email: email.trim(), name: name.trim(), password } as const)
      const res = await staffTransferOwnershipAction(restaurantId, input)
      if (!res.ok) {
        setError(t(`errors.${res.error}`))
        return
      }
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={expand}
        className="mt-3"
        data-test-id="transfer-owner-open"
      >
        {t('open')}
      </Button>
    )
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4" data-test-id="transfer-owner">
      <Tabs
        value={mode}
        onValueChange={(v) => {
          setMode((v ?? 'existing') as 'existing' | 'new')
          setError(null)
        }}
      >
        <TabsList>
          <TabsTrigger value="existing" data-test-id="transfer-mode-existing">
            {t('mode.existing')}
          </TabsTrigger>
          <TabsTrigger value="new" data-test-id="transfer-mode-new">
            {t('mode.new')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === 'existing' ? (
        <SelectField
          label={t('existing.label')}
          value={tenantId}
          onValueChange={setTenantId}
          placeholder={targets === null ? t('loading') : t('existing.placeholder')}
          hint={!tenantId ? t('existing.hint') : elig?.eligible ? t('existing.available') : undefined}
          error={tenantId && elig?.eligible === false ? t('existing.full') : undefined}
          options={(targets ?? []).map((x) => ({ value: x.id, label: `${x.name} — ${x.ownerEmail}` }))}
        />
      ) : (
        <div className="space-y-3">
          <TextField
            label={t('new.nameLabel')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoComplete="off"
            data-test-id="transfer-new-name"
          />
          <TextField
            label={t('new.emailLabel')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            data-test-id="transfer-new-email"
          />
          <TextField
            label={t('new.passwordLabel')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={t('new.passwordHint')}
            autoComplete="new-password"
            data-test-id="transfer-new-password"
          />
        </div>
      )}

      {error && <FieldMessage error={error} />}

      <div className="flex items-center gap-3">
        <Button
          variant="default"
          size="sm"
          onClick={submit}
          loading={pending}
          disabled={!canSubmit}
          data-test-id="transfer-submit"
        >
          {t('submit')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          data-test-id="transfer-cancel"
        >
          {t('cancel')}
        </Button>
      </div>
    </div>
  )
}
