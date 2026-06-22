import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import {
  ArrowRight,
  Blocks,
  Check,
  Compass,
  GraduationCap,
  Package,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react'
import { BRAND_NAME, CONTACT_EMAIL, PRODUCTS, productUrl } from '@iedora/brand'
import { LandingLangSwitch } from './lang-switch'

export const metadata: Metadata = {
  title: 'iedora — opinionated software house. AI consultancy, workshops & products.',
  description:
    'iedora is a small studio that builds AI worth keeping. We consult, run hands-on AI workshops, and ship our own products. Menu is live today.',
}

const mailto = `mailto:${CONTACT_EMAIL}`

/** House brand lockup — cinnabar square (blocks glyph) + wordmark. */
function Brand({ size = 'md' }: { size?: 'md' | 'sm' }) {
  const sq = size === 'sm' ? 'size-8' : 'size-9'
  const word = size === 'sm' ? 'text-[19px]' : 'text-[21px]'
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`grid ${sq} place-items-center rounded-[10px] bg-[var(--cinnabar)] text-white`}>
        <Blocks size={size === 'sm' ? 17 : 18} strokeWidth={2.2} />
      </span>
      <span className={`font-[family-name:var(--display)] ${word} font-extrabold tracking-[-0.02em] text-[var(--ink)]`}>
        {BRAND_NAME}
      </span>
    </span>
  )
}

/** Eyebrow pill (Pencil "Eyebrow") — cinnabar-soft pill, sparkle + label. */
function EyebrowPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--cinnabar-soft)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--cinnabar)]">
      <Sparkles size={14} strokeWidth={2.4} />
      {children}
    </span>
  )
}

/** Plain uppercase section label (the section heads, not the hero pill). */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-[family-name:var(--sans)] text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--cinnabar)]">
      {children}
    </p>
  )
}

function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-full bg-[var(--cinnabar)] px-6 py-3 font-[family-name:var(--display)] text-[15px] font-bold text-white no-underline transition-colors hover:bg-[var(--cinnabar-deep)]"
    >
      {children}
    </a>
  )
}

function LivePill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--green-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--green)]">
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      Live
    </span>
  )
}

export default async function HouseLanding() {
  const [t, locale] = await Promise.all([getTranslations('House'), getLocale()])
  const menuUrl = productUrl(PRODUCTS.menu)
  const menuHost = menuUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')

  const services = [
    { icon: Compass, title: t('service1Title'), desc: t('service1Desc') },
    { icon: GraduationCap, title: t('service2Title'), desc: t('service2Desc') },
    { icon: Package, title: t('service3Title'), desc: t('service3Desc') },
  ]
  const steps = [
    { n: '01', title: t('step1Title'), desc: t('step1Desc') },
    { n: '02', title: t('step2Title'), desc: t('step2Desc') },
    { n: '03', title: t('step3Title'), desc: t('step3Desc') },
  ]

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)] [font-family:var(--sans)]">
      {/* ── Announce ── */}
      <div className="flex items-center justify-center gap-2 bg-[var(--cinnabar)] px-4 py-2.5 text-center text-white">
        <Sparkles size={14} strokeWidth={2.4} className="shrink-0" />
        <span className="text-[13px] font-semibold sm:text-[14px]">{t('announce')}</span>
      </div>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 border-b border-[var(--rule)] bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] backdrop-blur">
        <nav className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-4 lg:px-10">
          <a href="/house" className="no-underline" aria-label={BRAND_NAME}>
            <Brand />
          </a>
          <div className="flex items-center gap-4 sm:gap-5">
            <LandingLangSwitch locale={locale} />
            {/* CTA lives in the hero on mobile (Pencil top bar = logo + lang only). */}
            <div className="hidden sm:block">
              <PrimaryButton href={mailto}>{t('navCta')}</PrimaryButton>
            </div>
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="bg-[var(--paper)]" data-test-id="house-hero">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center px-6 pb-12 pt-16 text-center lg:px-10 lg:pb-16 lg:pt-24">
          <EyebrowPill>{t('heroEyebrow')}</EyebrowPill>
          <h1 className="mt-4 max-w-[760px] font-[family-name:var(--display)] text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[58px]">
            {t('heroTitle')}
          </h1>
          <p className="mt-5 max-w-[640px] text-[17px] leading-[1.5] text-[var(--muted-foreground)] sm:text-[19px]">
            {t('heroSubtitle')}
          </p>
          <div className="mt-7">
            <PrimaryButton href={mailto}>
              {t('heroCta')}
              <ArrowRight size={17} strokeWidth={2.2} />
            </PrimaryButton>
          </div>
          <p className="mt-3.5 text-[14px] font-medium text-[var(--muted-foreground)]">{t('heroMicro')}</p>

          {/* Hero art — cinnabar-soft stage holding a tilted product mockup. */}
          <div className="mt-12 w-full max-w-[940px] overflow-hidden rounded-[28px] bg-[var(--cinnabar-soft)] px-6 py-12 sm:py-14">
            <div className="mx-auto w-full max-w-[440px] -rotate-2 rounded-[24px] border border-[var(--rule)] bg-white p-5 shadow-[0_18px_40px_-6px_rgba(31,26,22,0.15)]">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-[10px] bg-[var(--cinnabar)] text-white">
                    <UtensilsCrossed size={15} strokeWidth={2.2} />
                  </span>
                  <span className="font-[family-name:var(--display)] text-[15px] font-bold text-[var(--ink)]">
                    iedora · studio
                  </span>
                </span>
                <LivePill />
              </div>
              <div className="mt-5 space-y-2.5">
                <div className="h-3 w-full rounded-full bg-[var(--paper-2)]" />
                <div className="h-3 w-[70%] rounded-full bg-[var(--paper-2)]" />
                <div className="h-3 w-1/2 rounded-full bg-[var(--paper-2)]" />
              </div>
              <div className="mt-5 flex items-center gap-2.5">
                <span className="rounded-full bg-[var(--cinnabar)] px-4 py-2 font-[family-name:var(--display)] text-[14px] font-bold text-white">
                  Ship it
                </span>
                <span className="rounded-full bg-[var(--paper-2)] px-4 py-2 text-[14px] font-semibold text-[var(--muted-foreground)]">
                  Preview
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Manifesto ── */}
      <section className="bg-[var(--paper-2)]" data-test-id="house-manifesto">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center px-6 py-16 text-center lg:px-10 lg:py-24">
          <Eyebrow>{t('manifestoEyebrow')}</Eyebrow>
          <h2 className="mt-2 max-w-[760px] font-[family-name:var(--display)] text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[40px]">
            {t('manifestoTitle')}
          </h2>
          <p className="mt-2 text-[16px] text-[var(--muted-foreground)] sm:text-[17px]">{t('manifestoSubtitle')}</p>
          <ul className="mt-8 w-full max-w-[680px] space-y-3.5 text-left">
            {['belief1', 'belief2', 'belief3', 'belief4', 'belief5'].map((key) => (
              <li key={key} className="flex items-start gap-3">
                <Check size={20} strokeWidth={2.4} className="mt-0.5 shrink-0 text-[var(--cinnabar)]" />
                <span className="text-[16px] font-medium leading-[1.4] sm:text-[17px]">{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Services ── */}
      <section id="house-services" className="scroll-mt-20 bg-[var(--paper)]" data-test-id="house-services">
        <div className="mx-auto max-w-[1180px] px-6 py-16 lg:px-10 lg:py-24">
          <div className="flex flex-col items-center text-center">
            <Eyebrow>{t('servicesEyebrow')}</Eyebrow>
            <h2 className="mt-2 max-w-[760px] font-[family-name:var(--display)] text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[40px]">
              {t('servicesTitle')}
            </h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {services.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-[18px] border border-[var(--rule)] bg-[var(--card)] p-7">
                <span className="grid size-12 place-items-center rounded-[10px] bg-[var(--cinnabar-soft)] text-[var(--cinnabar)]">
                  <Icon size={24} strokeWidth={2.2} />
                </span>
                <h3 className="mt-4 font-[family-name:var(--display)] text-[19px] font-bold">{title}</h3>
                <p className="mt-2 text-[15px] leading-[1.5] text-[var(--muted-foreground)]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How we work ── */}
      <section className="bg-[var(--paper-2)]" data-test-id="house-how">
        <div className="mx-auto max-w-[1180px] px-6 py-16 lg:px-10 lg:py-24">
          <div className="flex flex-col items-center text-center">
            <Eyebrow>{t('howEyebrow')}</Eyebrow>
            <h2 className="mt-2 font-[family-name:var(--display)] text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[40px]">
              {t('howTitle')}
            </h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {steps.map(({ n, title, desc }) => (
              <div key={n}>
                <span className="grid size-11 place-items-center rounded-full bg-[var(--ink)] font-[family-name:var(--display)] text-[16px] font-bold text-[#FBF6EF]">
                  {n}
                </span>
                <h3 className="mt-3.5 font-[family-name:var(--display)] text-[20px] font-bold">{title}</h3>
                <p className="mt-2 text-[15px] leading-[1.5] text-[var(--muted-foreground)]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Products ── */}
      <section id="house-products" className="scroll-mt-20 bg-[var(--paper)]" data-test-id="house-products">
        <div className="mx-auto max-w-[1180px] px-6 py-16 lg:px-10 lg:py-24">
          <div className="flex flex-col items-center text-center">
            <Eyebrow>{t('productsEyebrow')}</Eyebrow>
            <h2 className="mt-2 font-[family-name:var(--display)] text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[40px]">
              {t('productsTitle')}
            </h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-[960px] items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-[family-name:var(--display)] text-[28px] font-extrabold tracking-[-0.02em]">{t('menuName')}</h3>
                <LivePill />
              </div>
              <p className="mt-4 text-[16px] leading-[1.5] text-[var(--muted-foreground)] sm:text-[17px]">{t('menuDesc')}</p>
              <a
                href={menuUrl}
                rel="noopener"
                className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[var(--cinnabar)] no-underline"
                data-test-id="house-product-menu"
              >
                {menuHost}
                <ArrowRight size={16} strokeWidth={2.2} />
              </a>
            </div>
            {/* Menu preview mockup */}
            <div className="mx-auto w-full max-w-[340px] rounded-[24px] border border-[var(--rule)] bg-white p-5 shadow-[0_18px_40px_-10px_rgba(31,26,22,0.15)]">
              <p className="font-[family-name:var(--display)] text-[17px] font-bold">La Trattoria</p>
              <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{t('menuPreviewCat')}</p>
              <div className="mt-4 space-y-3">
                {[
                  { name: 'Margherita', price: '€9' },
                  { name: 'Tagliatelle al ragù', price: '€14' },
                  { name: 'Tiramisù', price: '€6' },
                ].map((d) => (
                  <div key={d.name} className="flex items-center justify-between border-b border-[var(--rule)] pb-3 last:border-b-0 last:pb-0">
                    <span className="text-[15px] font-medium">{d.name}</span>
                    <span className="text-[15px] font-semibold tabular-nums text-[var(--muted-foreground)]">{d.price}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="rounded-full bg-[var(--cinnabar-soft)] px-3 py-1 text-[12px] font-semibold text-[var(--cinnabar)]">{t('menuQrReady')}</span>
                <span className="rounded-full bg-[var(--paper-2)] px-3 py-1 text-[12px] font-semibold text-[var(--muted-foreground)]">{t('menuLanguages')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Multilingual (dark) ── */}
      <section className="bg-[var(--ink)]" data-test-id="house-multilingual">
        <div className="mx-auto max-w-[1180px] px-6 py-16 text-center lg:px-10 lg:py-24">
          <Eyebrow>{t('multilingualEyebrow')}</Eyebrow>
          <h2 className="mt-2 font-[family-name:var(--display)] text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[#FBF6EF] sm:text-[40px]">
            {t('multilingualTitle')}
          </h2>
          <p className="mx-auto mt-4 max-w-[640px] text-[16px] leading-[1.5] text-[#B6A99C] sm:text-[17px]">{t('multilingualSubtitle')}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            {['EN', 'PT', 'ES', 'FR', t('langsMore')].map((l) => (
              <span key={l} className="rounded-full border border-[#B6A99C] px-3.5 py-1.5 text-[13px] font-semibold text-[#FBF6EF]">
                {l}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA band ── */}
      <section className="bg-[var(--cinnabar)]" data-test-id="house-cta">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center px-6 py-20 text-center lg:px-10 lg:py-28">
          <h2 className="max-w-[760px] font-[family-name:var(--display)] text-[34px] font-extrabold leading-[1.08] tracking-[-0.02em] text-white sm:text-[46px]">
            {t('ctaTitle')}
          </h2>
          <p className="mx-auto mt-4 max-w-[600px] text-[16px] leading-[1.5] text-white/90 sm:text-[17px]">{t('ctaSubtitle')}</p>
          <a
            href={mailto}
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-[family-name:var(--display)] text-[17px] font-bold text-[var(--cinnabar)] no-underline transition-transform hover:-translate-y-0.5"
            data-test-id="house-cta-email"
          >
            {CONTACT_EMAIL}
            <ArrowRight size={17} strokeWidth={2.4} />
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--rule)] bg-[var(--paper)]">
        <div className="mx-auto max-w-[1180px] px-6 py-12 lg:px-10">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
            <div className="max-w-[420px]">
              <Brand size="sm" />
              <p className="mt-3 text-[15px] leading-[1.5] text-[var(--muted-foreground)]">{t('footerTagline')}</p>
            </div>
            <nav className="flex flex-wrap gap-x-7 gap-y-2 text-[15px] font-medium">
              <a href="#house-services" className="text-[var(--ink)] no-underline hover:text-[var(--cinnabar)]">{t('footerServices')}</a>
              <a href="#house-products" className="text-[var(--ink)] no-underline hover:text-[var(--cinnabar)]">{t('footerProducts')}</a>
              <a href={mailto} className="text-[var(--ink)] no-underline hover:text-[var(--cinnabar)]">{t('footerWorkshops')}</a>
              <a href={mailto} className="text-[var(--ink)] no-underline hover:text-[var(--cinnabar)]">{t('footerContact')}</a>
            </nav>
          </div>
          <div className="mt-8 flex items-center justify-between border-t border-[var(--rule)] pt-5">
            <p className="text-[14px] text-[var(--muted-foreground)]">{t('copyright', { year: 2026 })}</p>
            <LandingLangSwitch locale={locale} />
          </div>
        </div>
      </footer>
    </div>
  )
}
