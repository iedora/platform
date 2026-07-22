'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { CircleCheck, Pencil } from 'lucide-react'
import { Button } from '@iedora/ui/components/ui/button'
import { staffReplaceMenusAction } from '@iedora/product-menu/features/restaurant-identity/actions'
import { isReplaceable, validateMenusJson } from './validate-menus-json'

// CodeMirror needs the DOM — load the editor client-only (same as the import form).
const JsonMenuEditor = dynamic(
  () => import('../../new/json-menu-editor').then((m) => m.JsonMenuEditor),
  { ssr: false },
)

/**
 * Admin "Edit menu as JSON" form. Loads the restaurant's live menu tree as a
 * { menus: [...] } document, validates edits against the same schema the service
 * uses, and saves by replacing the whole tree. The visual builder (a normal
 * owner surface, reachable cross-tenant by staff) is one click away for granular
 * edits.
 */
export function MenuJsonForm({
  id,
  initialJson,
  builderHref,
  detailHref,
}: {
  id: string
  initialJson: string
  builderHref: string
  detailHref: string
}) {
  const t = useTranslations('Admin.menuJson')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState(initialJson)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const validation = useMemo(() => validateMenusJson(text), [text])
  const canSave = isReplaceable(validation) && !pending

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await staffReplaceMenusAction({ id, payloadText: text })
      if (res.ok) {
        setSaved(true)
        router.refresh()
      } else {
        setError(res.error === 'invalidJson' ? t('invalidJson') : t('saveError'))
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-[13px] text-muted-foreground">{t('intro')}</p>
        <Button variant="outline" size="sm" onClick={() => router.push(builderHref)}>
          <Pencil size={15} /> {t('openBuilder')}
        </Button>
      </div>

      <JsonMenuEditor
        value={text}
        onChange={(v) => {
          setText(v)
          setSaved(false)
        }}
        validation={validation}
        problemsTitle={t('problemsTitle')}
        validLabel={t('validLabel')}
      />

      <p className="text-[12.5px] font-medium text-[#B54708]">{t('warning')}</p>

      {error ? (
        <p className="text-[13px] font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-green-600" data-test-id="menu-json-saved">
          <CircleCheck size={15} /> {t('saved')}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!canSave} data-test-id="menu-json-save">
          {pending ? t('saving') : t('save')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => router.push(detailHref)}>
          {t('back')}
        </Button>
      </div>
    </div>
  )
}
