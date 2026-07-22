'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { Button } from '@iedora/ui/components/ui/button'
import { TextField } from '@iedora/ui/components/field'
import { completeOnboarding, type OnboardingFormState } from './actions'
import { SupportLine } from '../_components/support-line'

/**
 * Step 1 form — the warm-light "Tell us about your restaurant" screen
 * (Pencil `iedora.pen` → "App · Onboarding 1"). Mobile-first, big tap
 * targets, plain words for 50+ owners. Fields:
 *   - restaurantName (required) → `restaurant.name`
 *   - Public URL — a live preview of the slug the server derives from the name
 *     (display only; an independently editable slug + live availability
 *     check needs a backend endpoint — future).
 *   - Languages — pick the menu's languages; the first becomes
 *     `defaultLanguage` (persisting the full set needs a backend update —
 *     future). Always at least one selected.
 * The create flow / server action is behaviour-preserving.
 */

/** Inline, framework-free name → slug preview (mirrors the server slugify). */
function slugPreview(value: string): string {
  const s = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return s || 'your-restaurant'
}

type Lang = { code: string; label: string }

export function OnboardingForm({
  languages,
  locale,
  urlPrefix,
}: {
  languages: Lang[]
  locale: string
  /** Env-based public-menu prefix, e.g. "menu.iedora.com/r/" or "localhost:3000/menu/r/". */
  urlPrefix: string
}) {
  const t = useTranslations('Onboarding')
  const [state, action, pending] = useActionState<OnboardingFormState, FormData>(
    completeOnboarding,
    undefined,
  )
  const [name, setName] = useState('')
  const [offered, setOffered] = useState<string[]>([locale])

  const slug = slugPreview(name)
  const nameError = state?.fieldErrors?.restaurantName

  function toggleLang(code: string) {
    setOffered((cur) =>
      cur.includes(code)
        ? cur.length > 1
          ? cur.filter((c) => c !== code)
          : cur // keep at least one selected
        : [...cur, code],
    )
  }

  return (
    <form action={action} className="flex flex-1 flex-col" data-test-id="onboarding-form">
      <h1 className="font-heading text-[28px] font-extrabold leading-[1.12] tracking-[-0.01em] text-foreground">
        {t('title')}
      </h1>
      <p className="mt-2 text-[15px] leading-[1.5] text-muted-foreground">{t('subtitle')}</p>

      <div className="mt-7 flex flex-col gap-5">
        {/* Restaurant name */}
        <TextField
          label={t('restaurantName')}
          name="restaurantName"
          type="text"
          autoFocus
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('restaurantNamePlaceholder')}
          hint={t('restaurantNameHint')}
          error={nameError}
          data-test-id="onboarding-restaurant-name"
        />

        {/* Public URL — live preview of the derived slug */}
        <div>
          <label className="mb-1.5 block text-[14px] font-semibold text-foreground">{t('publicUrl')}</label>
          <div className="flex items-center gap-1 rounded-[12px] border border-border bg-[var(--muted)] px-4 py-3 text-[15px]" data-test-id="onboarding-public-url">
            <span className="text-muted-foreground">{urlPrefix}</span>
            <span className="truncate font-semibold text-foreground">{slug}</span>
            <Check size={18} className="ml-auto shrink-0 text-green-600" />
          </div>
        </div>

        {/* Languages */}
        <div>
          <label className="mb-1.5 block text-[14px] font-semibold text-foreground">{t('languages')}</label>
          <div className="flex flex-wrap gap-2">
            {languages.map((l) => {
              const on = offered.includes(l.code)
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => toggleLang(l.code)}
                  aria-pressed={on}
                  data-test-id={`onboarding-lang-${l.code}`}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[14px] font-medium transition-colors ${
                    on
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground hover:border-primary/40'
                  }`}
                >
                  {on ? <Check size={14} /> : null}
                  {l.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {state?.error && (
        <p className="mt-5 text-center text-[14px] text-destructive" role="alert" data-test-id="onboarding-error">
          {state.error}
        </p>
      )}

      <input type="hidden" name="defaultLanguage" value={offered[0] ?? locale} />

      <div className="mt-auto pt-8">
        <Button
          type="submit"
          variant="default"
          size="lg"
          className="!w-full !justify-center"
          disabled={!name.trim() || pending}
          data-test-id="onboarding-submit"
        >
          {pending ? t('creating') : t('cta')}
        </Button>
        <SupportLine label={t('support')} className="mt-4" testId="onboarding-support" />
      </div>
    </form>
  )
}
