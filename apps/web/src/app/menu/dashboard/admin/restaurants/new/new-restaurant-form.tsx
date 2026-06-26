'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { BuildingsIcon, ClipboardTextIcon, GiftIcon, PlusIcon, SparkleIcon, UploadIcon, MagicWandIcon } from '@phosphor-icons/react'
import { Button } from '@iedora/ui/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@iedora/ui/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@iedora/ui/components/ui/tabs'
import { FieldHint, FieldLabel, FieldMessage, SelectField, TextField } from '@iedora/ui/components/field'
import {
  previewSlugAction,
  staffCreateRestaurantAction,
  staffImportRestaurantAction,
} from '@iedora/product-menu/features/restaurant-identity/actions'
import { useDebouncedAction } from '../../../../_components/use-debounced-action'
import { isImportable, validateMenuJson } from './validate-menu-json'

// CodeMirror needs the DOM — load the editor client-only with a sized fallback
// so the layout doesn't jump on hydration.
const JsonMenuEditor = dynamic(() => import('./json-menu-editor').then((m) => m.JsonMenuEditor), {
  ssr: false,
  loading: () => <div className="h-[340px] rounded-[12px] border border-border bg-muted" />,
})

type Tenant = { id: string; name: string; ownerEmail: string }
type Lang = { code: string; label: string }
type Mode = 'manual' | 'import'

const JSON_TEMPLATE = `{
  "restaurant": {
    "name": "La Trattoria",
    "slug": "la-trattoria",
    "defaultLanguage": "en",
    "supportedLanguages": ["en", "pt"]
  },
  "menus": [
    { "name": "Dinner", "categories": [
      { "name": "Pizzas", "items": [
        {
          "name": "1. Margherita",
          "description": "Tomato, mozzarella, basil",
          "priceCents": 950,
          "currency": "EUR",
          "nameI18n": { "pt": "1. Margherita" },
          "descriptionI18n": { "pt": "Tomate, mozzarella, manjericão" }
        },
        {
          "name": "2. Diavola",
          "currency": "EUR",
          "variants": [
            { "label": "Medium", "priceCents": 1050 },
            { "label": "Large", "priceCents": 1350 }
          ]
        }
      ] },
      { "name": "Specials", "items": [
        { "name": "Catch of the day", "description": "Market price" }
      ] }
    ] }
  ]
}`

// Pasteable into any vision LLM together with a menu photo. It pins the exact
// schema + the gotchas (cents, sections, original language) so the output drops
// straight into the editor.
const AI_PROMPT = `You are given one or more photos of a restaurant menu. Transcribe the menu into JSON that matches EXACTLY the schema below. Output ONLY the JSON, with no explanations and no markdown code fences.

Schema:
{
  "restaurant": {
    "name": "<restaurant name>",
    "slug": "<optional url slug; omit to derive from the name>",
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
              "priceCents": 950,
              "currency": "EUR",
              "variants": [ { "label": "<size/option>", "priceCents": 950 } ],
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
- No price? Omit "priceCents" entirely for dishes the menu prints without one (market price, "ask your server", a section's note). Do not write 0. A dish with no price simply shows no price.
- Variants are for a dish sold in several sizes or options (Small / Large, Glass / Bottle, ...). Put one entry per option in "variants", each with its own "label" and "priceCents", and then DO NOT set the item-level "priceCents". Most dishes have no variants, so omit "variants" for them.
- Dish numbers: when the menu numbers its dishes (common on large menus), keep the number as part of "name", e.g. "1. Pizza Margherita" or "23. Frango Piri-Piri". There is no separate number field.
- Never end "name" with a period. Strip any trailing "." from dish and section names (a number prefix keeps its dot, like "1.").
- Put each dish under the section it appears in on the menu (Starters, Mains, Desserts, Drinks, ...).
- Use a single menu unless the photos clearly show separate menus (e.g. Food and Drinks).
- "description" is optional. Include it only when the menu prints one, and never just repeat the dish name.
- Keep the top-level "name"/"description" in the menu's original language, and set "defaultLanguage" to that language code (en, pt, es or fr).
- "supportedLanguages" lists every language the menu should be available in (always include the default).
- For each item, translate the name and description into every supported language OTHER than the default, using "nameI18n"/"descriptionI18n" keyed by language code. Keep the same number prefix in every translation. Only use codes listed in "supportedLanguages". Drop these fields if there is only one language.
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
  urlPrefix,
}: {
  tenants: Tenant[]
  languages: Lang[]
  defaultLanguage: string
  /** Env-based public-menu prefix the server computes, e.g. "menu.iedora.com/r/" or "localhost:3000/menu/r/". */
  urlPrefix: string
}) {
  const t = useTranslations('Admin.newRestaurant')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [mode, setMode] = useState<Mode>('manual')
  const [error, setError] = useState<string | null>(null)

  // Shared tenant selection. A new tenant (named after the restaurant) is the
  // default — the common one-tenant-per-restaurant case; switch to an existing
  // one only when wanted.
  const [tenantMode, setTenantMode] = useState<'existing' | 'new'>('new')
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
  // The tenant name defaults to the restaurant name. In manual mode that's the
  // Name field; in import mode the name lives in the pasted JSON
  // (restaurant.name), so derive it there for the tenant preview + hint.
  const importRestaurant = useMemo(() => {
    try {
      const parsed = JSON.parse(payloadText) as { restaurant?: { name?: unknown; slug?: unknown } }
      return {
        name: typeof parsed.restaurant?.name === 'string' ? parsed.restaurant.name : '',
        slug: typeof parsed.restaurant?.slug === 'string' ? parsed.restaurant.slug : '',
      }
    } catch {
      return { name: '', slug: '' }
    }
  }, [payloadText])
  const tenantDefaultName = mode === 'import' ? importRestaurant.name : name

  // Slug: the manual Name's derived slug until the admin edits it (below Tenant).
  const [customSlug, setCustomSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  // Default slug per mode: the manual Name, or the import payload's slug (else
  // its name). The field below Tenant lets the admin override it either way.
  const slugDefault =
    mode === 'import' ? importRestaurant.slug || slugPreview(importRestaurant.name) : slugPreview(name)
  const slug = slugTouched ? customSlug : slugDefault
  // Resolves the slug a create would actually assign (debounced), so a collision
  // or invalid input shows before submit.
  const slugCheck = useDebouncedAction(slug, previewSlugAction)
  const errorText = error ? t(`errors.${error}`) : null

  // In "new tenant" mode the name is OPTIONAL and defaults to the restaurant
  // name (the common one-tenant-per-restaurant case); the admin can override
  // it. `defaultName` is the restaurant name on manual create; import resolves
  // its own default from the payload server-side.
  function resolveTenant(defaultName = ''): { tenantId?: string; newTenantName?: string } {
    if (tenantMode !== 'new') return { tenantId }
    return { newTenantName: newTenantName.trim() || defaultName.trim() }
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
    go(() =>
      staffCreateRestaurantAction({
        name: name.trim(),
        defaultLanguage: language,
        slug: slugTouched && slug.trim() ? slug.trim() : undefined,
        ...resolveTenant(name),
      }),
    )
  const onImport = () =>
    go(() =>
      staffImportRestaurantAction({
        ...resolveTenant(),
        payloadText,
        slug: slugTouched && slug.trim() ? slug.trim() : undefined,
      }),
    )

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

  return (
    <div className="space-y-5" data-test-id="new-restaurant-form">
      {/* Manual | Import JSON — shared Tabs (full-width on mobile). */}
      <Tabs
        value={mode}
        onValueChange={(v) => {
          setMode((v ?? 'manual') as Mode)
          setError(null)
        }}
      >
        <TabsList className="w-full sm:w-fit">
          {(['manual', 'import'] as Mode[]).map((m) => (
            <TabsTrigger key={m} value={m} data-test-id={`new-restaurant-tab-${m}`}>
              {t(`tabs.${m}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Mobile-first: the active mode leads; the tenant/slug/plan config rail
          drops below it and returns to the right column on lg+. */}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="min-w-0 space-y-3">
          {mode === 'manual' ? (
            <Card className="gap-0 py-0" data-test-id="new-restaurant-manual">
              <CardHeader className="border-b border-border p-5">
                <CardTitle>{t('manual.heading')}</CardTitle>
                <CardDescription>{t('manual.hint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 p-5">
                <TextField
                  id="new-restaurant-name"
                  data-test-id="new-restaurant-name"
                  label={t('manual.nameLabel')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder={t('manual.namePlaceholder')}
                  autoFocus
                  className="gap-1.5"
                />

                <div className="grid gap-1.5">
                  <FieldLabel>{t('manual.urlLabel')}</FieldLabel>
                  {/* break-all so the full URL wraps instead of being trimmed
                      on narrow phones (down to 320px / iPhone 4S). */}
                  <p className="border border-border bg-muted px-3 py-2.5 text-sm break-all">
                    <span className="text-muted-foreground">{urlPrefix}</span>
                    <span className="font-semibold text-foreground">{slug}</span>
                  </p>
                </div>

                <SelectField
                  label={t('manual.languageLabel')}
                  value={language}
                  onValueChange={setLanguage}
                  options={languages.map((l) => ({ value: l.code, label: l.label }))}
                  hint={t('manual.languageHint')}
                  className="gap-1.5"
                />

                <Button
                  type="button"
                  onClick={onCreate}
                  loading={pending}
                  disabled={!name.trim()}
                  data-test-id="new-restaurant-create"
                  className="w-full sm:w-auto"
                >
                  {t('manual.submit')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="gap-0 py-0" data-test-id="new-restaurant-import">
              <CardHeader className="border-b border-border p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{t('import.heading')}</CardTitle>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button variant="ghost" size="sm" type="button" onClick={copyPrompt} data-test-id="new-restaurant-copy-prompt">
                      {copied ? <ClipboardTextIcon size={14} weight="bold" /> : <SparkleIcon size={14} weight="bold" />}
                      {copied ? t('import.copied') : t('import.copyPrompt')}
                    </Button>
                    <Button variant="ghost" size="sm" type="button" onClick={formatJson} disabled={!canFormat} data-test-id="new-restaurant-format">
                      <MagicWandIcon size={14} weight="bold" />
                      {t('import.format')}
                    </Button>
                    <Button variant="ghost" size="sm" type="button" onClick={() => setPayloadText(JSON_TEMPLATE)} data-test-id="new-restaurant-template">
                      {t('import.template')}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <p className="text-sm leading-relaxed text-muted-foreground">{t('import.lead')}</p>
                <JsonMenuEditor
                  value={payloadText}
                  onChange={setPayloadText}
                  validation={importValidation}
                  problemsTitle={t('import.problems')}
                  validLabel={t('import.valid')}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[12px] text-muted-foreground">{t('import.hint')}</p>
                  <Button
                    type="button"
                    onClick={onImport}
                    loading={pending}
                    disabled={!isImportable(importValidation)}
                    data-test-id="new-restaurant-import-submit"
                  >
                    <UploadIcon size={15} weight="bold" />
                    {t('import.submit')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {errorText ? <FieldMessage error={errorText} data-test-id="new-restaurant-error" /> : null}
        </div>

        {/* Config rail: tenant + slug + plan. */}
        <div className="space-y-3">
          <Card size="sm" data-test-id="new-restaurant-tenant">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>{t('tenant.label')}</FieldLabel>
                {tenants.length ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setTenantMode((m) => (m === 'new' ? 'existing' : 'new'))}
                    data-test-id="new-restaurant-tenant-toggle"
                  >
                    {tenantMode === 'new' ? (
                      t('tenant.useExisting')
                    ) : (
                      <>
                        <PlusIcon size={13} weight="bold" /> {t('tenant.new')}
                      </>
                    )}
                  </Button>
                ) : null}
              </div>

              {tenantMode === 'existing' ? (
                <SelectField
                  label=""
                  value={tenantId}
                  onValueChange={setTenantId}
                  options={tenants.map((tn) => ({ value: tn.id, label: tn.name, description: tn.ownerEmail }))}
                  data-test-id="new-restaurant-tenant-select"
                />
              ) : (
                <div className="flex items-center gap-2 border border-border bg-card px-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center bg-muted text-muted-foreground">
                    <BuildingsIcon size={16} />
                  </span>
                  <input
                    type="text"
                    value={newTenantName}
                    onChange={(e) => setNewTenantName(e.target.value)}
                    maxLength={120}
                    placeholder={tenantDefaultName.trim() || t('tenant.newPlaceholder')}
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    data-test-id="new-restaurant-tenant-name"
                  />
                </div>
              )}
              <FieldHint className="break-words leading-relaxed">
                {tenantMode === 'existing' ? (
                  t('tenant.hint')
                ) : tenantDefaultName.trim() ? (
                  t.rich('tenant.newHintNamed', {
                    name: tenantDefaultName.trim(),
                    b: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
                  })
                ) : (
                  t('tenant.newHint')
                )}
              </FieldHint>
            </CardContent>
          </Card>

          <Card size="sm" data-test-id="new-restaurant-slug">
            <CardContent className="space-y-1.5">
              <FieldLabel htmlFor="new-restaurant-slug-input">{t('slug.label')}</FieldLabel>
              {/* flex-wrap + min-w-0 so the prefix wraps and the input drops to
                  its own full-width line on narrow phones instead of overflowing. */}
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border border-border bg-card px-3 py-2.5 text-sm">
                <span className="min-w-0 break-all text-muted-foreground">{urlPrefix}</span>
                <input
                  id="new-restaurant-slug-input"
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setCustomSlug(e.target.value.toLowerCase())
                  }}
                  maxLength={40}
                  spellCheck={false}
                  className="min-w-[7rem] flex-1 bg-transparent font-semibold text-foreground outline-none"
                  data-test-id="new-restaurant-slug-input"
                />
              </div>
              <FieldHint className="break-words leading-relaxed">
                {!slugCheck ? (
                  t('slug.hint')
                ) : !slugCheck.valid ? (
                  <span className="text-destructive">{t('slug.invalid')}</span>
                ) : slugCheck.available ? (
                  <span className="font-semibold text-green-700">{t('slug.available')}</span>
                ) : (
                  t.rich('slug.taken', {
                    slug: slugCheck.slug,
                    b: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
                  })
                )}
              </FieldHint>
            </CardContent>
          </Card>

          <Card size="sm" className="bg-green-100" data-test-id="new-restaurant-plan">
            <CardContent className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center bg-green-600 text-white">
                <GiftIcon size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-foreground">{t('plan.name')}</p>
                <p className="text-[12px] text-muted-foreground">{t('plan.note')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
