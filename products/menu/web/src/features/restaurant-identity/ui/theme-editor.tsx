'use client'

import type { ReactNode } from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Badge } from '@iedora/ui/components/ui/badge'
import { Button } from '@iedora/ui/components/ui/button'
import { Checkbox } from '@iedora/ui/components/ui/checkbox'
import { Combobox } from '@iedora/ui/components/combobox'
import {
  Field,
  FieldHint,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from '@iedora/ui/components/field'
import { Panel, PanelHeader } from '../../../shared/ui/crm'
import { ImageUpload } from '../../upload/ui/image-upload'
import { LocalizedFields } from '../../i18n/ui/localized-fields'
import { MenuRenderer } from '../../menu-publishing/rsc/menu-renderer'
import type { PublicMenu, PublicRestaurant } from '../../menu-publishing/rsc/types'
import type { LocalizedText } from '../../i18n'
import {
  BRAND_SWATCHES,
  DEFAULT_THEME,
  HEX_PATTERN,
  matchPreset,
  STYLE_PRESETS,
  type ResolvedTheme,
} from '../../menu-publishing/rsc/theme'
import { LANGUAGE_META, type LanguageCode } from '../../i18n'
import { Currencies } from '@iedora/contracts'
import {
  updateIdentity,
  updateLanguageSettings,
  updateSlug,
  updateTheme,
} from '../actions'

export type LanguageSettings = {
  defaultLanguage: LanguageCode
  supportedLanguages: LanguageCode[]
  defaultCurrency: string
}

// The save/reset actions reuse the design-system Button but adopt the warm
// rounded-full pill that is now the single button shape across the product
// (landing + dashboard), instead of the square admin-kit default.
const PILL = '!rounded-full normal-case tracking-normal'

// The currency symbol for a code ("EUR" → "€"), derived from the platform's
// Intl data so we don't hand-maintain a symbol map. Falls back to the code.
function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}

// Static — the supported currencies never change, so build the option labels
// (each derives an Intl symbol) ONCE at module load, not per LocaleSection render.
const currencyOptions = Currencies.map((code) => ({
  value: code,
  label: `${code} · ${currencySymbol(code)}`,
}))

type Identity = Pick<
  PublicRestaurant,
  'name' | 'description' | 'logoUrl' | 'bannerUrl'
> & { descriptionI18n: LocalizedText }

export function ThemeEditor({
  slug,
  restaurant,
  restaurantDescriptionI18n,
  menus,
  initialTheme,
  initialLanguageSettings,
  urlPrefix,
}: {
  slug: string
  restaurant: PublicRestaurant
  restaurantDescriptionI18n: LocalizedText
  menus: PublicMenu[]
  initialTheme: ResolvedTheme
  initialLanguageSettings: LanguageSettings
  /** Env-based public-menu prefix, e.g. "menu.iedora.com/r/" or "localhost:3000/menu/r/". */
  urlPrefix: string
}) {
  const router = useRouter()
  const tEditor = useTranslations('Settings')
  const initialIdentity: Identity = {
    name: restaurant.name,
    description: restaurant.description,
    logoUrl: restaurant.logoUrl,
    bannerUrl: restaurant.bannerUrl,
    descriptionI18n: restaurantDescriptionI18n,
  }

  const [identity, setIdentity] = useState<Identity>(initialIdentity)
  const [theme, setTheme] = useState<ResolvedTheme>(initialTheme)

  const previewRestaurant: PublicRestaurant = { ...restaurant, ...identity }

  return (
    // Two-column at lg+: settings left (420px), preview sticky right.
    // On mobile we don't get two columns, so the preview goes FIRST
    // (order utilities) and lives inside a capped, scrollable frame —
    // otherwise a long menu would push every settings card below the
    // fold. Card order in the settings column reads identity → content
    // → look → URL; the slug is last because changing it breaks every
    // bookmark to the old URL and the operator rarely needs it.
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="order-2 space-y-6 lg:order-none">
        {/* SETTINGS group — the restaurant's configuration: who it is, what
            language + currency the menu speaks, and its public URL. */}
        <section className="space-y-3" data-test-id="settings-group">
          <GroupLabel>{tEditor('groups.settings')}</GroupLabel>
          <Panel data-test-id="settings-card-identity">
            <IdentitySection
              slug={slug}
              defaultLanguage={initialLanguageSettings.defaultLanguage}
              supportedLanguages={initialLanguageSettings.supportedLanguages}
              initial={initialIdentity}
              value={identity}
              onChange={setIdentity}
              onSaved={() => router.refresh()}
            />
          </Panel>
          <Panel data-test-id="settings-card-locale">
            <LocaleSection
              slug={slug}
              initial={initialLanguageSettings}
              onSaved={() => router.refresh()}
            />
          </Panel>
          <Panel data-test-id="settings-card-url">
            <SlugSection currentSlug={slug} urlPrefix={urlPrefix} />
          </Panel>
        </section>

        {/* THEME group — the visual look, picked as a whole-style preset plus a
            single brand colour. */}
        <section className="space-y-3" data-test-id="theme-group">
          <GroupLabel>{tEditor('groups.theme')}</GroupLabel>
          <Panel data-test-id="settings-card-theme">
            <ThemeSection
              slug={slug}
              initial={initialTheme}
              value={theme}
              onChange={setTheme}
              onSaved={() => router.refresh()}
            />
          </Panel>
        </section>
      </div>

      <div className="order-1 lg:order-none lg:sticky lg:top-6 lg:h-fit">
        <PreviewLabel />
        <div
          className="max-h-[60vh] overflow-auto rounded-[18px] border border-border bg-card lg:max-h-none lg:overflow-hidden"
          data-test-id="theme-preview"
          data-layout={theme.layout}
        >
          <MenuRenderer
            restaurant={previewRestaurant}
            menus={menus}
            theme={theme}
          />
        </div>
      </div>
    </div>
  )
}

function PreviewLabel() {
  const t = useTranslations('Settings')
  return (
    <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
      {t('livePreview')}
    </div>
  )
}

/** A divider heading that separates the two panel groups (Settings · Theme). */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h2>
  )
}

function LocaleSection({
  slug,
  initial,
  onSaved,
}: {
  slug: string
  initial: LanguageSettings
  onSaved: () => void
}) {
  const [defaultLang, setDefaultLang] = useState<LanguageCode>(
    initial.defaultLanguage,
  )
  // Tracked as a Set so toggle is O(1) and order in the persisted array
  // follows the registry order (deterministic across renders).
  const [supported, setSupported] = useState<Set<LanguageCode>>(
    () => new Set(initial.supportedLanguages),
  )
  const [currency, setCurrency] = useState<string>(initial.defaultCurrency)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('Settings.Languages')
  const tc = useTranslations('Common')

  function toggle(code: LanguageCode) {
    setSaved(false)
    setError(null)
    setSupported((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        // Default cannot be removed — fallback chain breaks otherwise.
        if (code === defaultLang) return prev
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }

  function selectDefault(code: LanguageCode) {
    setSaved(false)
    setError(null)
    setDefaultLang(code)
    setSupported((prev) => new Set(prev).add(code))
  }

  const supportedList = LANGUAGE_META.filter((l) => supported.has(l.code)).map(
    (l) => l.code,
  )

  const dirty =
    defaultLang !== initial.defaultLanguage ||
    currency !== initial.defaultCurrency ||
    supportedList.length !== initial.supportedLanguages.length ||
    supportedList.some((c, i) => c !== initial.supportedLanguages[i])

  function onSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updateLanguageSettings(slug, {
        defaultLanguage: defaultLang,
        supportedLanguages: supportedList,
        defaultCurrency: currency,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSaved(true)
      onSaved()
    })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <PanelHeader title={t('localeTitle')} hint={t('localeSubtitle')} />

      {/* Single-column list of language rows. Each row: design-system
          Checkbox on the left (serif label + native name), then either
          a "Default" badge or a ghost-button "Make default" on the
          right. Min-height 44px hits the touch-target floor. */}
      <ul className="space-y-2" data-test-id="lang-list">
        {LANGUAGE_META.map((lang) => {
          const isSupported = supported.has(lang.code)
          const isDefault = defaultLang === lang.code
          return (
            <li
              key={lang.code}
              data-test-id={`lang-row-${lang.code}`}
              className={
                'flex min-h-11 min-w-0 items-center gap-3 rounded-[12px] border px-3 py-2 ' +
                (isSupported
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card')
              }
            >
              <label className="flex min-w-0 flex-1 items-center gap-2.5">
                <Checkbox
                  checked={isSupported}
                  onCheckedChange={() => toggle(lang.code)}
                  disabled={isDefault}
                  data-test-id={`lang-supported-${lang.code}`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-foreground">
                    {lang.name}
                  </span>
                  <span className="block truncate text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
                    {lang.nativeName}
                  </span>
                </span>
              </label>
              {isDefault ? (
                <Badge
                  variant="default"
                  data-test-id={`lang-default-${lang.code}`}
                  className="shrink-0"
                >
                  {t('default')}
                </Badge>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => selectDefault(lang.code)}
                  data-test-id={`lang-default-${lang.code}`}
                  className="shrink-0 whitespace-nowrap !rounded-full normal-case tracking-normal"
                >
                  {t('makeDefault')}
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      {/* Default currency — new dishes inherit it (existing dishes keep their
          own currency). One control, the same Combobox family as the rest. */}
      <Field>
        <FieldLabel htmlFor="locale-currency">{t('currency')}</FieldLabel>
        <Combobox
          id="locale-currency"
          data-test-id="locale-currency"
          options={currencyOptions}
          value={currency}
          onChange={(v) => {
            if (!v) return
            setCurrency(v)
            setSaved(false)
            setError(null)
          }}
          clearable={false}
          aria-label={t('currency')}
        />
        <FieldHint>{t('currencyHint')}</FieldHint>
      </Field>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button
          type="submit"
          variant="default"
          className={PILL}
          disabled={!dirty || pending}
          data-test-id="languages-save"
        >
          {pending ? tc('saving') : t('save')}
        </Button>
        {saved && !dirty && (
          <span className="text-sm text-muted-foreground">{t('saved')}</span>
        )}
        {error && (
          <span className="text-sm text-destructive">{error}</span>
        )}
      </div>
    </form>
  )
}

function IdentitySection({
  slug,
  defaultLanguage,
  supportedLanguages,
  initial,
  value,
  onChange,
  onSaved,
}: {
  slug: string
  defaultLanguage: LanguageCode
  supportedLanguages: LanguageCode[]
  initial: Identity
  value: Identity
  onChange: (next: Identity) => void
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const t = useTranslations('Settings.Identity')
  const tc = useTranslations('Common')

  // Save button only tracks text fields. Logo/banner are persisted directly
  // by the ImageUpload component via features/upload/actions, so they don't
  // contribute to the dirty state here.
  const dirty =
    value.name !== initial.name ||
    (value.description ?? '') !== (initial.description ?? '') ||
    JSON.stringify(value.descriptionI18n) !==
      JSON.stringify(initial.descriptionI18n)

  const nameValid = value.name.trim().length > 0

  function patch<K extends keyof Identity>(key: K, v: Identity[K]) {
    onChange({ ...value, [key]: v })
    setSaved(false)
    setError(null)
  }

  function onSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updateIdentity(slug, {
        name: value.name,
        description: value.description ?? '',
        descriptionI18n: value.descriptionI18n,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSaved(true)
      onSaved()
    })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <PanelHeader title={t('title')} hint={t('subtitle')} />

      <Field>
        <FieldLabel htmlFor="identity-name">{t('name')}</FieldLabel>
        <FieldInput
          id="identity-name"
          data-test-id="identity-name"
          value={value.name}
          onChange={(e) => patch('name', e.target.value)}
          maxLength={120}
          required
          placeholder={t('namePlaceholder')}
          error={Boolean(error) || (dirty && !nameValid)}
          aria-describedby={error ? 'identity-name-msg' : 'identity-name-hint'}
        />
        <FieldHint id="identity-name-hint">{t('nameHint')}</FieldHint>
      </Field>

      {supportedLanguages.length > 1 ? (
        <LocalizedFields
          id="identity"
          defaultLanguage={defaultLanguage}
          supportedLanguages={supportedLanguages}
          // Restaurant name is a proper noun (mono-language) and lives
          // in the `Field` above; the tabbed editor only handles the
          // translatable description. `showName={false}` keeps the
          // language tabs but skips the redundant name row.
          name=""
          onNameChange={() => {}}
          nameI18n={{}}
          onNameI18nChange={() => {}}
          showName={false}
          description={value.description ?? ''}
          onDescriptionChange={(v) => patch('description', v)}
          descriptionI18n={value.descriptionI18n}
          onDescriptionI18nChange={(next) => patch('descriptionI18n', next)}
          descriptionLabel={t('description')}
        />
      ) : (
        <Field>
          <FieldLabel htmlFor="identity-description">{t('description')}</FieldLabel>
          <FieldTextarea
            id="identity-description"
            data-test-id="identity-description"
            value={value.description ?? ''}
            onChange={(e) => patch('description', e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t('descriptionPlaceholder')}
            aria-describedby="identity-description-hint"
          />
          <FieldHint id="identity-description-hint">{t('descriptionHint')}</FieldHint>
        </Field>
      )}

      <Field>
        <FieldLabel>{t('logo')}</FieldLabel>
        <ImageUpload
          target={{ kind: 'restaurant-logo', slug }}
          currentUrl={value.logoUrl}
          label={t('logo')}
          onChange={(url) => {
            patch('logoUrl', url ?? undefined)
            onSaved()
          }}
        />
      </Field>

      <Field>
        <FieldLabel>{t('banner')}</FieldLabel>
        <ImageUpload
          target={{ kind: 'restaurant-banner', slug }}
          currentUrl={value.bannerUrl}
          label={t('banner')}
          onChange={(url) => {
            patch('bannerUrl', url ?? undefined)
            onSaved()
          }}
        />
      </Field>

      <div className="flex items-center gap-3 pt-1">
        <Button
          type="submit"
          variant="default"
          className={PILL}
          disabled={!dirty || !nameValid || pending}
          data-test-id="identity-save"
        >
          {pending ? tc('saving') : t('save')}
        </Button>
        {saved && !dirty && (
          <span className="text-sm text-muted-foreground">Saved</span>
        )}
        {error && (
          <span id="identity-name-msg" role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
      </div>
    </form>
  )
}

/**
 * Slug editor — separate from IdentitySection because the cost model is
 * different (changing the slug breaks bookmarks to the old URL + drops
 * the dashboard URL the user is on). Inline preview shows the resulting
 * `/r/<slug>` URL. On save, we route the dashboard URL to the new slug
 * so the operator stays on the same page they were editing.
 */
function SlugSection({ currentSlug, urlPrefix }: { currentSlug: string; urlPrefix: string }) {
  const router = useRouter()
  const t = useTranslations('Settings.Slug')
  const tc = useTranslations('Common')
  const [draft, setDraft] = useState(currentSlug)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const normalized = draft.trim().toLowerCase()
  const dirty = normalized !== currentSlug
  const looksValid =
    /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(normalized)

  function onSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await updateSlug(currentSlug, normalized)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSaved(true)
      // Route to the new dashboard URL — the requireRestaurantBySlug guard
      // on /dashboard/r/<currentSlug> would 404 now that the row's slug
      // moved. router.replace (not push) so the back button doesn't take
      // the user to a now-dead URL.
      router.replace(`/dashboard/r/${res.slug}`)
      router.refresh()
    })
  }

  return (
    <form
      className="space-y-4"
      data-test-id="slug-section"
      onSubmit={(e) => {
        e.preventDefault()
        if (dirty && looksValid) onSave()
      }}
    >
      <PanelHeader title={t('title')} hint={t('subtitle')} />

      <Field>
        <FieldLabel htmlFor="slug-input">{t('label')}</FieldLabel>
        <div className="flex flex-wrap items-baseline gap-1">
          <span className="text-sm text-muted-foreground">{urlPrefix}</span>
          <FieldInput
            id="slug-input"
            data-test-id="slug-input"
            className="min-w-0 flex-1 sm:min-w-[16ch]"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setSaved(false)
              setError(null)
            }}
            maxLength={40}
            error={Boolean(error) || (dirty && !looksValid)}
            aria-describedby={error ? 'slug-input-msg' : undefined}
          />
        </div>
        <FieldHint>{t('hint')}</FieldHint>
      </Field>

      {dirty && (
        <p className="text-xs text-primary" role="status">
          {t('warning')}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button
          type="submit"
          variant="default"
          className={PILL}
          disabled={!dirty || !looksValid || pending}
          data-test-id="slug-save"
        >
          {pending ? tc('saving') : t('save')}
        </Button>
        {saved && !dirty && (
          <span className="text-sm text-muted-foreground">{t('saved')}</span>
        )}
        {error && (
          <span id="slug-input-msg" role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
      </div>
    </form>
  )
}

function ThemeSection({
  slug,
  initial,
  value,
  onChange,
  onSaved,
}: {
  slug: string
  initial: ResolvedTheme
  value: ResolvedTheme
  onChange: (next: ResolvedTheme) => void
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const t = useTranslations('Settings.Theme')
  const tc = useTranslations('Common')

  const dirty =
    value.layout !== initial.layout ||
    value.font !== initial.font ||
    value.primaryColor !== initial.primaryColor ||
    value.secondaryColor !== initial.secondaryColor

  const primaryValid = HEX_PATTERN.test(value.primaryColor)
  const secondaryValid = HEX_PATTERN.test(value.secondaryColor)
  const canSave = dirty && primaryValid && secondaryValid && !pending

  // The preset whose layout+font match the current theme (brand colour is an
  // independent override, so a colour tweak doesn't drop the preset selection).
  const activePreset = matchPreset(value)

  function patch<K extends keyof ResolvedTheme>(key: K, v: ResolvedTheme[K]) {
    onChange({ ...value, [key]: v })
    setSaved(false)
    setError(null)
  }

  function pickPreset(p: (typeof STYLE_PRESETS)[number]) {
    onChange({
      layout: p.layout,
      font: p.font,
      primaryColor: p.primaryColor,
      secondaryColor: p.secondaryColor,
    })
    setSaved(false)
    setError(null)
  }

  function onSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updateTheme(slug, value)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSaved(true)
      onSaved()
    })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <PanelHeader title={t('title')} hint={t('subtitle')} />

      {/* Style presets — each card adopts a whole look (layout + font +
          palette). The selected one is whichever preset matches the current
          layout+font; the brand colour below layers on top of it. Two columns
          on a phone, three from `sm` — tap targets stay generous at 320px. */}
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium text-foreground">{t('style')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-test-id="theme-presets">
          {STYLE_PRESETS.map((p) => {
            const selected = activePreset?.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pickPreset(p)}
                aria-pressed={selected}
                data-test-id={`preset-${p.id}`}
                className={
                  'flex flex-col gap-2 rounded-[14px] border p-2.5 text-left transition-colors ' +
                  (selected
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border bg-card hover:border-primary/40')
                }
              >
                <span className="flex h-9 overflow-hidden rounded-[8px] border border-border" aria-hidden="true">
                  <span className="flex-1" style={{ background: p.primaryColor }} />
                  <span className="w-1/3" style={{ background: p.secondaryColor }} />
                </span>
                <span className="truncate text-[12.5px] font-semibold text-foreground">
                  {t(`presets.${p.key}`)}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* Brand colour — one accent the owner can set on top of any preset.
          Quick-pick swatches plus a full picker (the reused ColorField). */}
      <div className="space-y-2">
        <FieldLabel htmlFor="theme-primary-hex">{t('brandColor')}</FieldLabel>
        <div className="flex flex-wrap gap-2" data-test-id="brand-swatches">
          {BRAND_SWATCHES.map((hex) => {
            const on = value.primaryColor.toLowerCase() === hex
            return (
              <button
                key={hex}
                type="button"
                aria-label={hex}
                aria-pressed={on}
                data-test-id={`brand-swatch-${hex}`}
                onClick={() => patch('primaryColor', hex)}
                className={
                  'size-8 rounded-full border transition-transform ' +
                  (on ? 'border-foreground ring-2 ring-primary/30' : 'border-border hover:scale-110')
                }
                style={{ background: hex }}
              />
            )
          })}
        </div>
        <ColorField
          id="theme-primary"
          label={t('brandColorCustom')}
          hint={t('brandColorHint')}
          value={value.primaryColor}
          valid={primaryValid}
          onChange={(v) => patch('primaryColor', v)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button
          type="submit"
          variant="default"
          className={PILL}
          disabled={!canSave}
          data-test-id="theme-save"
        >
          {pending ? tc('saving') : t('save')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={PILL}
          onClick={() => {
            onChange(DEFAULT_THEME)
            setSaved(false)
            setError(null)
          }}
          disabled={pending}
        >
          {t('reset')}
        </Button>
        {saved && !dirty && (
          <span className="text-sm text-muted-foreground">{t('saved')}</span>
        )}
        {error && (
          <span className="text-sm text-destructive">{error}</span>
        )}
      </div>
    </form>
  )
}

function ColorField({
  id,
  label,
  hint,
  value,
  valid,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  valid: boolean
  onChange: (v: string) => void
}) {
  // NOT wrapped in <Field>. The global `.ds-field input { width: 100% }`
  // rule stretches every input inside a Field — including
  // <input type="color"> — turning the 40×40 swatch into a full-width
  // colored bar. We replicate the field rhythm (label · row · hint
  // stacked with 6px gaps) by hand and keep the color picker outside
  // the cascade. Hex chip uses the `.ds-input--compact` chip from the
  // design system so it matches the Combobox / Field-compact family.
  return (
    <div className="grid w-full max-w-[380px] gap-1.5 font-[family-name:var(--mono)]">
      <FieldLabel htmlFor={`${id}-hex`}>{label}</FieldLabel>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="color"
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 flex-shrink-0 cursor-pointer rounded-[10px] border border-border bg-transparent p-0"
          aria-label={`${label} picker`}
          data-test-id={`${id}-picker`}
        />
        <input
          id={`${id}-hex`}
          data-test-id={`${id}-hex`}
          className={
            'h-9 min-w-0 flex-1 rounded-md border bg-transparent px-3 font-mono text-sm uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
            (valid ? 'border-input focus-visible:border-ring' : 'border-destructive')
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          maxLength={7}
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : `${id}-hex-hint`}
        />
      </div>
      <FieldHint
        id={`${id}-hex-hint`}
        className={valid ? undefined : 'text-destructive'}
      >
        {hint}
      </FieldHint>
    </div>
  )
}
