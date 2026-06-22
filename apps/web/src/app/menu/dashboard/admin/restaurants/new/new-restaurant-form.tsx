'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Building2, Check, ChevronLeft, ClipboardCheck, Gift, Plus, Sparkles, Upload, Wand2 } from 'lucide-react'
import {
  staffCreateRestaurantAction,
  staffImportRestaurantAction,
} from '@iedora/product-menu/features/restaurant-identity/actions'
import { isImportable, validateMenuJson } from './validate-menu-json'

// Warm-light primary button (cinnabar, rounded, inline icon). Used instead of
// the design-system Button here so it matches the form's surface and an inline
// leading icon lays out correctly.
const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-2 rounded-[12px] bg-primary px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--cinnabar-deep)] disabled:cursor-not-allowed disabled:opacity-50'

// CodeMirror needs the DOM — load the editor client-only with a sized fallback
// so the layout doesn't jump on hydration.
const JsonMenuEditor = dynamic(() => import('./json-menu-editor').then((m) => m.JsonMenuEditor), {
  ssr: false,
  loading: () => <div className="h-[340px] rounded-[12px] border border-border bg-[var(--paper-2)]" />,
})

type Tenant = { id: string; name: string; ownerEmail: string }
type Lang = { code: string; label: string }
type Mode = 'manual' | 'import'

const JSON_TEMPLATE = `{
  "restaurant": {
    "name": "La Trattoria",
    "defaultLanguage": "en",
    "supportedLanguages": ["en", "pt"]
  },
  "menus": [
    { "name": "Dinner", "categories": [
      { "name": "Pizzas", "items": [
        {
          "name": "Margherita",
          "description": "Tomato, mozzarella, basil",
          "priceCents": 950,
          "currency": "EUR",
          "nameI18n": { "pt": "Margherita" },
          "descriptionI18n": { "pt": "Tomate, mozzarella, manjericão" }
        }
      ] }
    ] }
  ]
}`

// Pasteable into any vision LLM together with a menu photo. It pins the exact
// schema + the gotchas (cents, sections, original language) so the output drops
// straight into the editor.
const AI_PROMPT = `You are given one or more photos of a restaurant menu. Transcribe the menu into JSON that matches EXACTLY the schema below. Output ONLY the JSON — no explanations, no markdown code fences.

Schema:
{
  "restaurant": {
    "name": "<restaurant name>",
    "defaultLanguage": "en",
    "supportedLanguages": ["en", "pt"]
  },
  "menus": [
    {
      "name": "<menu name, e.g. Dinner>",
      "categories": [
        {
          "name": "<section heading, e.g. Starters>",
          "items": [
            {
              "name": "<dish>",
              "description": "<optional>",
              "priceCents": 0,
              "currency": "EUR",
              "nameI18n": { "pt": "<dish translated>" },
              "descriptionI18n": { "pt": "<description translated>" }
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- priceCents is the price in CENTS as an integer: 9.50 becomes 950, 12 becomes 1200. Never use decimals or currency symbols.
- Put each dish under the section it appears in on the menu (Starters, Mains, Desserts, Drinks, ...).
- Use a single menu unless the photos clearly show separate menus (e.g. Food and Drinks).
- "description" is optional — include it only when the menu prints one.
- Keep the top-level "name"/"description" in the menu's original language, and set "defaultLanguage" to that language code (en, pt, es or fr).
- "supportedLanguages" lists every language the menu should be available in (always include the default).
- For each item, translate the name and description into every supported language OTHER than the default, using "nameI18n"/"descriptionI18n" keyed by language code. Only use codes listed in "supportedLanguages". Drop these fields if there is only one language.
- Make sure the result is valid JSON.`

/** Inline name → slug preview (mirrors the server's slugify). */
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

/**
 * Admin "New restaurant" form. A Manual / Import JSON toggle switches the whole
 * create mode; the tenant picker (existing, or a new tenant) and the On Us plan
 * note are shared. Import mode is a real JSON editor (syntax highlighting + live
 * validation against the import schema) with a one-click LLM prompt for turning
 * a menu photo into the payload. Each mode calls a staff-gated server action and
 * routes to the new restaurant on success.
 */
export function NewRestaurantForm({
  tenants,
  languages,
  defaultLanguage,
}: {
  tenants: Tenant[]
  languages: Lang[]
  defaultLanguage: string
}) {
  const t = useTranslations('Admin.newRestaurant')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [mode, setMode] = useState<Mode>('manual')
  const [error, setError] = useState<string | null>(null)

  // Shared tenant selection. With no tenants yet, only "new" is possible.
  const [tenantMode, setTenantMode] = useState<'existing' | 'new'>(tenants.length ? 'existing' : 'new')
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '')
  const [newTenantName, setNewTenantName] = useState('')

  // Manual fields.
  const [name, setName] = useState('')
  const [language, setLanguage] = useState(
    languages.some((l) => l.code === defaultLanguage) ? defaultLanguage : (languages[0]?.code ?? 'en'),
  )

  // Import field + live client-side validation (same schema as the service).
  const [payloadText, setPayloadText] = useState('')
  const [copied, setCopied] = useState(false)
  const importValidation = useMemo(() => validateMenuJson(payloadText), [payloadText])

  const slug = slugPreview(name)
  const errorText = error ? t(`errors.${error}`) : null

  function resolveTenant(): { tenantId?: string; newTenantName?: string } {
    return tenantMode === 'new' ? { newTenantName: newTenantName.trim() } : { tenantId }
  }

  function go(run: () => Promise<{ ok: true; id: string } | { ok: false; error: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await run()
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(`/menu/dashboard/admin/restaurants/${res.id}`)
    })
  }

  const onCreate = () =>
    go(() => staffCreateRestaurantAction({ name: name.trim(), defaultLanguage: language, ...resolveTenant() }))
  const onImport = () => go(() => staffImportRestaurantAction({ ...resolveTenant(), payloadText }))

  function copyPrompt() {
    void navigator.clipboard?.writeText(AI_PROMPT).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    })
  }

  // Pretty-print the pasted JSON (2-space indent). Only possible once it parses,
  // so the button is enabled for 'valid' / 'invalid' (schema-wrong but parseable).
  const canFormat = importValidation.state === 'valid' || importValidation.state === 'invalid'
  function formatJson() {
    try {
      setPayloadText(JSON.stringify(JSON.parse(payloadText), null, 2))
    } catch {
      /* not parseable — button is disabled in this state */
    }
  }

  const fieldCls =
    'w-full rounded-[12px] border border-border bg-card px-4 py-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cinnabar)_22%,transparent)]'

  return (
    <div className="space-y-7" data-test-id="new-restaurant-form">
      <div className="flex flex-col items-start gap-4">
        <Link
          href="/menu/dashboard/admin/restaurants"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
        >
          <ChevronLeft size={15} strokeWidth={2.2} /> {t('back')}
        </Link>

        {/* Manual | Import JSON toggle */}
        <div
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1"
          role="tablist"
          aria-label={t('modeLabel')}
        >
          {(['manual', 'import'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m)
                setError(null)
              }}
              className={`rounded-full px-5 py-2 text-[13.5px] font-semibold transition-colors ${
                mode === m ? 'bg-[var(--cinnabar-soft)] text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-test-id={`new-restaurant-tab-${m}`}
            >
              {t(`tabs.${m}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Left: the active mode */}
        <div className="min-w-0">
          {mode === 'manual' ? (
            <section className="overflow-hidden rounded-[18px] border border-border bg-card" data-test-id="new-restaurant-manual">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-[16px] font-bold text-foreground">{t('manual.heading')}</h2>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">{t('manual.hint')}</p>
              </div>
              <div className="space-y-5 p-5">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-[var(--ink-soft)]">{t('manual.nameLabel')}</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                    placeholder={t('manual.namePlaceholder')}
                    className={fieldCls}
                    data-test-id="new-restaurant-name"
                    autoFocus
                  />
                </label>

                <div>
                  <span className="mb-1.5 block text-[13px] font-semibold text-[var(--ink-soft)]">{t('manual.urlLabel')}</span>
                  <div className="flex items-center gap-1 rounded-[12px] border border-border bg-[var(--paper-2)] px-4 py-3 text-[15px]">
                    <span className="text-muted-foreground">iedora.com/m/</span>
                    <span className="truncate font-semibold text-foreground">{slug}</span>
                    <Check size={16} strokeWidth={2.5} className="ml-auto shrink-0 text-[var(--green)]" />
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block text-[13px] font-semibold text-[var(--ink-soft)]">{t('manual.languageLabel')}</span>
                  <div className="flex flex-wrap gap-2">
                    {languages.map((l) => {
                      const on = language === l.code
                      return (
                        <button
                          key={l.code}
                          type="button"
                          onClick={() => setLanguage(l.code)}
                          aria-pressed={on}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${
                            on
                              ? 'border-primary bg-[var(--cinnabar-soft)] text-primary'
                              : 'border-border bg-card text-foreground hover:border-[color-mix(in_srgb,var(--cinnabar)_40%,transparent)]'
                          }`}
                          data-test-id={`new-restaurant-lang-${l.code}`}
                        >
                          {on ? <Check size={13} strokeWidth={2.6} /> : null}
                          {l.label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-[12px] text-muted-foreground">{t('manual.languageHint')}</p>
                </div>

                <button
                  type="button"
                  onClick={onCreate}
                  disabled={pending || !name.trim()}
                  className={PRIMARY_BTN}
                  data-test-id="new-restaurant-create"
                >
                  {pending ? t('creating') : t('manual.submit')}
                </button>
              </div>
            </section>
          ) : (
            <section className="overflow-hidden rounded-[18px] border border-border bg-card" data-test-id="new-restaurant-import">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <h2 className="text-[16px] font-bold text-foreground">{t('import.heading')}</h2>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={copyPrompt}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary transition-colors hover:text-[var(--cinnabar-deep)]"
                    data-test-id="new-restaurant-copy-prompt"
                  >
                    {copied ? <ClipboardCheck size={14} strokeWidth={2.4} /> : <Sparkles size={14} strokeWidth={2.4} />}
                    {copied ? t('import.copied') : t('import.copyPrompt')}
                  </button>
                  <button
                    type="button"
                    onClick={formatJson}
                    disabled={!canFormat}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    data-test-id="new-restaurant-format"
                  >
                    <Wand2 size={14} strokeWidth={2.2} />
                    {t('import.format')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayloadText(JSON_TEMPLATE)}
                    className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    data-test-id="new-restaurant-template"
                  >
                    {t('import.template')}
                  </button>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t('import.lead')}</p>
                <JsonMenuEditor
                  value={payloadText}
                  onChange={setPayloadText}
                  validation={importValidation}
                  problemsTitle={t('import.problems')}
                  validLabel={t('import.valid')}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] text-muted-foreground">{t('import.hint')}</p>
                  <button
                    type="button"
                    onClick={onImport}
                    disabled={pending || !isImportable(importValidation)}
                    className={PRIMARY_BTN}
                    data-test-id="new-restaurant-import-submit"
                  >
                    <Upload size={15} strokeWidth={2.2} />
                    {pending ? t('importing') : t('import.submit')}
                  </button>
                </div>
              </div>
            </section>
          )}

          {errorText ? (
            <p className="mt-3 text-[13px] text-[#D92D20]" role="alert" data-test-id="new-restaurant-error">
              {errorText}
            </p>
          ) : null}
        </div>

        {/* Right: shared tenant + plan */}
        <div className="space-y-5">
          <section className="rounded-[18px] border border-border bg-card p-5" data-test-id="new-restaurant-tenant">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--ink-soft)]">{t('tenant.label')}</span>
              {tenants.length ? (
                <button
                  type="button"
                  onClick={() => setTenantMode((m) => (m === 'new' ? 'existing' : 'new'))}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary transition-colors hover:text-[var(--cinnabar-deep)]"
                  data-test-id="new-restaurant-tenant-toggle"
                >
                  {tenantMode === 'new' ? (
                    t('tenant.useExisting')
                  ) : (
                    <>
                      <Plus size={13} strokeWidth={2.6} /> {t('tenant.new')}
                    </>
                  )}
                </button>
              ) : null}
            </div>

            {tenantMode === 'existing' ? (
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className={fieldCls}
                data-test-id="new-restaurant-tenant-select"
              >
                {tenants.map((tn) => (
                  <option key={tn.id} value={tn.id}>
                    {tn.name} — {tn.ownerEmail}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2 rounded-[12px] border border-border bg-card px-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--paper-2)] text-muted-foreground">
                  <Building2 size={16} />
                </span>
                <input
                  type="text"
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  maxLength={120}
                  placeholder={t('tenant.newPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                  data-test-id="new-restaurant-tenant-name"
                />
              </div>
            )}
            <p className="mt-2 text-[12px] text-muted-foreground">{t('tenant.hint')}</p>
          </section>

          <section className="flex items-center gap-3 rounded-[14px] bg-[var(--green-soft)] p-3.5" data-test-id="new-restaurant-plan">
            <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--green)] text-white">
              <Gift size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-foreground">{t('plan.name')}</p>
              <p className="text-[12px] text-muted-foreground">{t('plan.note')}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
