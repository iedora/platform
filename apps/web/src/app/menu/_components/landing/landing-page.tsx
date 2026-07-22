import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { Check, Utensils, Play } from 'lucide-react'
import { Button } from '@iedora/ui/components/ui/button'
import { Card, CardContent } from '@iedora/ui/components/ui/card'
import { signInUrl, signUpUrl } from '@iedora/product-menu/shared/auth-urls'
import { LangSwitch } from './lang-switch'
import { MenuPreviewCard } from './menu-preview-card'
import { ThemeToggle } from '@iedora/ui/components/theme-toggle'
import {
  Accent,
  CheckList,
  Container,
  CtaBand,
  CtaButton,
  InvertedBand,
  Section,
  SectionHead,
  Steps,
  Tag,
} from '../../../../components/landing'

/**
 * Menu marketing landing. Same design language as the house page (/house):
 * editorial monospace section labels, hairline rules, shadcn Card + Button,
 * token colours (dark/light safe), compact copy. The restaurant motif lives in
 * the dotted menu leaders and the "Today's special" card.
 */

const SIGN_IN_HREF = signInUrl()
const SIGN_UP_HREF = signUpUrl()

type Dish = { name: string; price: string }
type Plan = { tier: string; price: string; per: string; badge?: string; cta: string; feats: string[] }
type FooterCol = { heading: string; links: string[] }

/** Google Maps location pin (Google red + white dot). */
function GoogleMapsMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
        fill="#EA4335"
      />
      <circle cx="12" cy="9" r="2.5" fill="#fff" />
    </svg>
  )
}

/** TheFork app-icon style — green roundel with a fork. */
function TheForkMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#00684A" />
      <g fill="#fff">
        <rect x="9.2" y="5" width="1" height="4" rx="0.5" />
        <rect x="11.5" y="5" width="1" height="4" rx="0.5" />
        <rect x="13.8" y="5" width="1" height="4" rx="0.5" />
        <path d="M9 8.5h6v0.4a3 3 0 0 1-6 0z" />
        <rect x="11.2" y="11" width="1.6" height="8" rx="0.8" />
      </g>
    </svg>
  )
}

/** iedora wordmark — fork-knife square + name. Shared by header + footer. */
function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Utensils size={17} />
      </span>
      <span className="font-heading text-[20px] font-extrabold tracking-[-0.02em] text-foreground">iedora</span>
    </span>
  )
}

export default async function LandingPage() {
  const [t, locale] = await Promise.all([getTranslations('Landing'), getLocale()])

  const dishes = t.raw('hero.dishes') as Dish[]
  const features = t.raw('features.items') as string[]
  const steps = t.raw('how.steps') as { title: string; body: string }[]
  const bullets = t.raw('board.bullets') as string[]
  const onus = t.raw('pricing.onus') as Plan
  const kasa = t.raw('pricing.kasa') as Plan
  const worksWith = t.raw('worksWith') as string[]
  const footerCols = t.raw('footer.columns') as FooterCol[]
  const igHref = t('social.instagram')
  const ttHref = t('social.tiktok')

  return (
    <div className="min-h-screen bg-background text-foreground text-pretty [&_h1]:text-balance [&_h2]:text-balance [&_p]:text-balance [&_blockquote]:text-balance">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <Container className="flex h-14 items-center justify-between gap-3">
          <Link href="/menu" className="no-underline">
            <Logo />
          </Link>
          <ul className="ml-auto hidden items-center gap-7 lg:flex">
            {[
              { label: t('nav.features'), href: '#features' },
              { label: t('nav.how'), href: '#how' },
              { label: t('nav.pricing'), href: '#pricing' },
            ].map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-[14px] font-medium text-muted-foreground no-underline hover:text-foreground">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-2 lg:ml-7">
            <LangSwitch />
            <CtaButton href={SIGN_IN_HREF} variant="secondary">
              {t('nav.signIn')}
            </CtaButton>
          </div>
        </Container>
      </header>

      {/* Hero */}
      <section data-test-id="menu-hero">
        <Container className="grid gap-10 pb-12 pt-12 sm:pb-16 sm:pt-16 lg:grid-cols-2 lg:items-center lg:gap-14">
          <div>
            <Accent underline>{t('hero.accent')}</Accent>
            <h1 className="mt-5 max-w-[15ch] font-heading text-[34px] font-extrabold leading-[1.04] tracking-[-0.02em] sm:text-[46px] lg:text-[56px]">
              {t('hero.headline')}
            </h1>
            <p className="mt-5 max-w-[44ch] text-[16px] leading-[1.55] text-muted-foreground sm:text-[18px]">
              {t('hero.subhead')}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <CtaButton href={SIGN_UP_HREF} full>
                {t('hero.ctaPrimary')}
              </CtaButton>
              <CtaButton href="#how" variant="secondary" full>
                <Play size={15} className="shrink-0 fill-current" />
                {t('hero.ctaSecondary')}
              </CtaButton>
            </div>
            {/* Direct links to — brand chips. Stacked one-per-line on mobile,
                all on a single line at sm+ (never a half-wrapped middle). */}
            <div className="mt-6 flex flex-col items-start gap-2 text-[13px] sm:flex-row sm:items-center">
              <span className="italic text-muted-foreground">{t('hero.worksWithLabel')}</span>
              <a
                href="https://www.thefork.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-semibold text-foreground no-underline hover:border-primary/45"
              >
                <TheForkMark className="size-4 shrink-0" />
                {worksWith[0]}
              </a>
              <a
                href="https://maps.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-semibold text-foreground no-underline hover:border-primary/45"
              >
                <GoogleMapsMark className="size-4 shrink-0" />
                {worksWith[1]}
              </a>
            </div>
          </div>

          {/* Interactive multilingual demo — tap a language to translate the card */}
          <MenuPreviewCard name={t('hero.card.name')} dishes={dishes} initialLang={locale} />
        </Container>
      </section>

      {/* 01 Features */}
      <Section id="features" className="scroll-mt-16 bg-muted" data-test-id="menu-features">
        <SectionHead index="01" eyebrow={t('features.accent')} title={t('features.title')} />
        <CheckList items={features} bordered />
      </Section>

      {/* 02 How */}
      <Section id="how" className="scroll-mt-16" data-test-id="menu-how">
        <SectionHead index="02" eyebrow={t('how.accent')} title={t('how.title')} />
        <Steps items={steps.map((s) => ({ title: s.title, desc: s.body }))} />
      </Section>

      {/* Board (inverted band) */}
      <InvertedBand eyebrow={t('board.accent')} title={t('board.title')} data-test-id="menu-board">
        <ul className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-x-4 gap-y-3 text-left">
          {bullets.map((b) => (
            <li key={b} className="flex items-center gap-2 text-[14.5px]">
              <Check size={16} className="shrink-0 text-primary" />
              {b}
            </li>
          ))}
        </ul>
      </InvertedBand>

      {/* 03 Pricing */}
      <Section id="pricing" className="scroll-mt-16" data-test-id="menu-pricing">
        <SectionHead index="03" eyebrow={t('pricing.accent')} title={t('pricing.title')} />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <PlanCard plan={onus} href={SIGN_UP_HREF} />
          <PlanCard plan={kasa} href={SIGN_UP_HREF} highlighted />
        </div>
      </Section>

      {/* CTA band */}
      <CtaBand title={t('cta.title')} subtitle={t('cta.subhead')} data-test-id="menu-cta">
        <Button render={<a href={SIGN_UP_HREF} />} className="!w-full !justify-center !rounded-full !bg-primary-foreground !text-primary hover:!bg-primary-foreground/90 sm:!w-auto" nativeButton={false} size="lg">
          {t('cta.primary')}
        </Button>
        <Button
          render={<a href={SIGN_IN_HREF} />}
          nativeButton={false}
          variant="ghost"
          size="lg"
          className="!w-full !justify-center !rounded-full !border !border-primary-foreground/45 !text-primary-foreground hover:!bg-primary-foreground/10 hover:!text-primary-foreground sm:!w-auto"
        >
          {t('cta.secondary')}
        </Button>
      </CtaBand>

      {/* Footer */}
      <footer className="border-t border-border">
        <Container className="flex flex-col gap-6 py-10">
          <div className="flex flex-col gap-2.5">
            <Logo />
            <p className="text-[14px] text-muted-foreground">{t('footer.tagline')}</p>
            <p className="text-[12.5px] text-muted-foreground">{t('footer.langLine')}</p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            {footerCols.map((col) => (
              <div key={col.heading} className="flex flex-col gap-2.5">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {col.heading}
                </p>
                {col.links.map((l) => (
                  <a key={l} href="#" className="text-[14px] text-foreground no-underline hover:text-primary">
                    {l}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <div className="flex items-center gap-3">
              <a
                href={igHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="grid size-9 place-items-center rounded-full bg-muted text-foreground hover:bg-primary/10 hover:text-primary"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="2" y="2" width="20" height="20" rx="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
                  <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
                  <circle cx="17.5" cy="6.5" r="1.3" fill="currentColor" />
                </svg>
              </a>
              <a
                href={ttHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
                className="grid size-9 place-items-center rounded-full bg-muted text-foreground hover:bg-primary/10 hover:text-primary"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M16.5 3c.35 2.4 1.9 4.05 4.5 4.3v3.05c-1.5.02-2.95-.45-4.2-1.32v6.05a5.85 5.85 0 1 1-5.85-5.85c.32 0 .63.03.94.08v3.16a2.75 2.75 0 1 0 1.86 2.6V3h2.75z"
                    fill="currentColor"
                  />
                </svg>
              </a>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-[12.5px] text-muted-foreground">{t('footer.copyright')}</p>
              <ThemeToggle />
            </div>
          </div>
        </Container>
      </footer>
    </div>
  )
}

function PlanCard({ plan, href, highlighted = false }: { plan: Plan; href: string; highlighted?: boolean }) {
  return (
    <Card size="sm" className={highlighted ? 'ring-2 ring-primary' : ''}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-heading text-[18px] font-extrabold">{plan.tier}</p>
          {plan.badge ? <Tag tone="special">{plan.badge}</Tag> : null}
        </div>
        <p className="flex items-baseline gap-1">
          <span className="font-heading text-[28px] font-extrabold tracking-[-0.02em]">{plan.price}</span>
          <span className="text-[13px] text-muted-foreground">{plan.per}</span>
        </p>
        <ul className="flex flex-1 flex-col gap-2">
          {plan.feats.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[13.5px]">
              <Check size={15} className="shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
        <CtaButton href={href} variant={highlighted ? 'default' : 'secondary'} full>
          {plan.cta}
        </CtaButton>
      </CardContent>
    </Card>
  )
}
