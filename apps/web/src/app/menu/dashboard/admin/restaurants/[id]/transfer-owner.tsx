'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@iedora/ui/components/ui/button'
import { AppDialog } from '@iedora/ui/components/app-dialog'
import { Tabs, TabsList, TabsTrigger } from '@iedora/ui/components/ui/tabs'
import { FieldMessage, PasswordField, SelectField, TextField } from '@iedora/ui/components/field'
import {
  listTransferTargetsAction,
  staffTransferOwnershipAction,
  transferEligibilityAction,
} from '@iedora/product-menu/features/restaurant-identity/actions'
import { useDebouncedAction } from '../../../../_components/use-debounced-action'

type Target = { id: string; name: string; ownerEmail: string }

/**
 * "Transfer ownership" dialog on the Owner card, built on the shared `AppDialog`
 * shell so it matches every other modal in the product. Two modes: move this
 * restaurant to an existing tenant (plan-gated, with live eligibility), or create
 * a new user who receives the whole tenant. The create-user logic lives once in
 * the auth service. On success the dialog closes and the server component
 * re-fetches so the new owner + audit entry show immediately.
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
  // Which new-user fields the operator has interacted with — client-side
  // validation only surfaces once a field is touched (or after a submit).
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean; password?: boolean }>({})
  // A server-rejected email (taken) routed onto the email field; cleared on the
  // next edit. Other failures show the service's detailed message inline.
  const [serverField, setServerField] = useState<{ email?: string; tenant?: string }>({})
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

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  // Field-level errors — a server-mapped error wins; otherwise a touched
  // client check. These render inline under the relevant field.
  const nameError = touched.name && !name.trim() ? t('errors.nameRequired') : undefined
  const emailError =
    serverField.email ??
    (touched.email && email.trim() && !emailOk ? t('errors.emailInvalid') : undefined)
  const passwordError =
    touched.password && password.length > 0 && password.length < 12
      ? t('errors.passwordShort')
      : undefined
  const tenantError =
    serverField.tenant ?? (tenantId && elig?.eligible === false ? t('existing.full') : undefined)

  const canSubmit =
    !pending &&
    (mode === 'existing'
      ? Boolean(tenantId) && elig?.eligible === true
      : name.trim().length > 0 && emailOk && password.length >= 12)

  function submit() {
    setError(null)
    setServerField({})
    startTransition(async () => {
      const input =
        mode === 'existing'
          ? ({ mode: 'existing', tenantId } as const)
          : ({ mode: 'new', email: email.trim(), name: name.trim(), password } as const)
      const res = await staffTransferOwnershipAction(restaurantId, input)
      if (!res.ok) {
        // Route a taken email onto the email field; otherwise show the detailed
        // message the service returned (falling back to the i18n key).
        if (res.error === 'emailTaken') setServerField({ email: t('errors.emailTaken') })
        else setError(res.message ?? t(`errors.${res.error}`))
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={expand}
        className="mt-3"
        data-test-id="transfer-owner-open"
      >
        {t('open')}
      </Button>

      <AppDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setError(null)
        }}
        title={t('open')}
        size="md"
        data-test-id="transfer-owner"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              data-test-id="transfer-cancel"
            >
              {t('cancel')}
            </Button>
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
          </>
        }
      >
        <div className="space-y-3">
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
          onValueChange={(v) => {
            setTenantId(v)
            setServerField((s) => ({ ...s, tenant: undefined }))
          }}
          placeholder={targets === null ? t('loading') : t('existing.placeholder')}
          hint={!tenantId ? t('existing.hint') : elig?.eligible ? t('existing.available') : undefined}
          error={tenantError}
          options={(targets ?? []).map((x) => ({ value: x.id, label: x.name, description: x.ownerEmail }))}
        />
      ) : (
        <div className="space-y-3">
          <TextField
            label={t('new.nameLabel')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((s) => ({ ...s, name: true }))}
            error={nameError}
            maxLength={120}
            autoComplete="off"
            data-test-id="transfer-new-name"
          />
          <TextField
            label={t('new.emailLabel')}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setServerField((s) => ({ ...s, email: undefined }))
            }}
            onBlur={() => setTouched((s) => ({ ...s, email: true }))}
            error={emailError}
            autoComplete="off"
            data-test-id="transfer-new-email"
          />
          <PasswordField
            label={t('new.passwordLabel')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((s) => ({ ...s, password: true }))}
            error={passwordError}
            hint={passwordError ? undefined : t('new.passwordHint')}
            autoComplete="new-password"
            data-test-id="transfer-new-password"
          />
        </div>
      )}

          {error && <FieldMessage error={error} />}
        </div>
      </AppDialog>
    </>
  )
}
