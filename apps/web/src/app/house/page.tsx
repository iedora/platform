import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import {
  ArrowRight,
  GraduationCap,
  Package,
  LayoutGrid,
  Layers,
} from 'lucide-react'
import { Card, CardContent } from '@iedora/ui/components/ui/card'
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
  SectionLabel,
  Steps,
  Tag,
} from '@iedora/ui/components/landing'
import { BRAND_NAME, CONTACT_EMAIL, PRODUCTS, productUrl } from '@iedora/brand'
import { LandingLangSwitch } from './lang-switch'

export const metadata: Metadata = {
  title: 'iedora · software house. Custom builds, AI workshops, products we run.',
  description:
    'A small software house. We build custom products end to end, from the first commit to the servers they run on, run hands-on AI workshops, and ship our own (Menu is live today).',
}

const mailto = `mailto:${CONTACT_EMAIL}`

/** House brand lockup — cinnabar square + wordmark. */
function Brand({ size = 'md' }: { size?: 'md' | 'sm' }) {
  const sq = size === 'sm' ? 'size-8' : 'size-9'
  const word = size === 'sm' ? 'text-[18px]' : 'text-[20px]'
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`grid ${sq} shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground`}>
        <LayoutGrid size={size === 'sm' ? 17 : 18} />
      </span>
      <span className={`font-heading ${word} font-extrabold tracking-[-0.02em] text-foreground`}>{BRAND_NAME}</span>
    </span>
  )
}

export default async function HouseLanding() {
  const [t, locale] = await Promise.all([getTranslations('House'), getLocale()])
  const menuUrl = productUrl(PRODUCTS.menu)
  const menuHost = menuUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')

  const services = [
    { icon: Layers, title: t('service1Title'), desc: t('service1Desc') },
    { icon: GraduationCap, title: t('service2Title'), desc: t('service2Desc') },
    { icon: Package, title: t('service3Title'), desc: t('service3Desc') },
  ]
  const steps = [
    { n: '01', title: t('step1Title'), desc: t('step1Desc') },
    { n: '02', title: t('step2Title'), desc: t('step2Desc') },
    { n: '03', title: t('step3Title'), desc: t('step3Desc') },
  ]
  const beliefs = ['belief1', 'belief2', 'belief3', 'belief4', 'belief5'] as const
  const dishes = [
    { name: 'Margherita', price: '€9' },
    { name: 'Tagliatelle al ragù', price: '€14' },
    { name: 'Tiramisù', price: '€6' },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground text-pretty [&_h1]:text-balance [&_h2]:text-balance [&_p]:text-balance [&_blockquote]:text-balance">
      {/* Announce */}
      <div className="bg-primary text-primary-foreground">
        <Container className="py-2 text-center">
          <span className="text-[12px] font-semibold leading-snug sm:text-[13px]">{t('announce')}</span>
        </Container>
      </div>

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <Container className="flex h-14 items-center justify-between gap-3">
          <a href="/house" className="no-underline" aria-label={BRAND_NAME}>
            <Brand />
          </a>
          <div className="flex items-center gap-2 sm:gap-3">
            <LandingLangSwitch locale={locale} />
            <div className="hidden sm:block">
              <CtaButton href={mailto}>{t('navCta')}</CtaButton>
            </div>
          </div>
        </Container>
      </header>

      {/* Hero */}
      <section data-test-id="house-hero">
        <Container className="pb-12 pt-12 sm:pb-16 sm:pt-20">
          <Accent underline>{t('heroEyebrow')}</Accent>
          <h1 className="mt-5 max-w-[15ch] font-heading text-[34px] font-extrabold leading-[1.03] tracking-[-0.03em] sm:text-[52px] lg:text-[68px]">
            {t('heroTitle')}
          </h1>
          <p className="mt-5 max-w-[48ch] text-[16px] leading-[1.55] text-muted-foreground sm:text-[18px]">
            {t('heroSubtitle')}
          </p>
          <div className="mt-7">
            <CtaButton href={mailto} full>
              {t('heroCta')}
              <ArrowRight size={17} className="shrink-0" />
            </CtaButton>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground">{t('heroMicro')}</p>
        </Container>
      </section>

      {/* Beliefs */}
      <Section className="bg-muted" data-test-id="house-manifesto">
        <SectionHead
          eyebrow={t('manifestoEyebrow')}
          title={
            <>
              {t('manifestoTitle')} <span className="text-muted-foreground">{t('manifestoSubtitle')}</span>
            </>
          }
          className="max-w-[20ch]"
        />
        <CheckList items={beliefs.map((key) => t(key))} />
      </Section>

      {/* Services */}
      <Section id="house-services" className="scroll-mt-16" data-test-id="house-services">
        <SectionHead index="01" eyebrow={t('servicesEyebrow')} title={t('servicesTitle')} className="max-w-[18ch]" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {services.map(({ icon: Icon, title, desc }) => (
              <Card key={title} size="sm">
                <CardContent className="flex flex-col gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-primary">
                    <Icon size={22} />
                  </span>
                  <h3 className="font-heading text-[18px] font-bold">{title}</h3>
                  <p className="text-[14.5px] leading-[1.5] text-muted-foreground">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
      </Section>

      {/* How */}
      <Section className="bg-muted" data-test-id="house-how">
        <SectionHead index="02" eyebrow={t('howEyebrow')} title={t('howTitle')} />
        <Steps items={steps} />
      </Section>

      {/* Products */}
      <Section id="house-products" className="scroll-mt-16" data-test-id="house-products">
        <SectionHead index="03" eyebrow={t('productsEyebrow')} title={t('productsTitle')} />
        <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-14">
            <div>
              <h3 className="font-heading text-[26px] font-extrabold tracking-[-0.02em]">{t('menuName')}</h3>
              <p className="mt-3 text-[16px] leading-[1.5] text-muted-foreground">{t('menuDesc')}</p>
              <a
                href={menuUrl}
                rel="noopener"
                className="mt-4 inline-flex items-center gap-1.5 break-all text-[15px] font-semibold text-primary no-underline"
                data-test-id="house-product-menu"
              >
                {menuHost}
                <ArrowRight size={16} className="shrink-0" />
              </a>
            </div>
            <Card size="sm" className="w-full">
              <CardContent>
                <p className="font-heading text-[17px] font-bold">La Trattoria</p>
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{t('menuPreviewCat')}</p>
                <div className="mt-4 space-y-3">
                  {dishes.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-baseline gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0"
                    >
                      <span className="text-[15px] font-medium">{d.name}</span>
                      <span className="h-px flex-1 self-center border-b border-dotted border-border" aria-hidden="true" />
                      <span className="text-[15px] font-semibold tabular-nums text-muted-foreground">{d.price}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Tag tone="primary">{t('menuQrReady')}</Tag>
                  <Tag tone="muted">{t('menuLanguages')}</Tag>
                </div>
              </CardContent>
            </Card>
          </div>
      </Section>

      {/* Multilingual (inverted band) */}
      <InvertedBand
        eyebrow={t('multilingualEyebrow')}
        title={t('multilingualTitle')}
        data-test-id="house-multilingual"
      >
        <p className="mx-auto mt-3 max-w-[52ch] text-[15px] leading-[1.5] text-background/70 sm:text-[17px]">
          {t('multilingualSubtitle')}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {['EN', 'PT', 'ES', 'FR', t('langsMore')].map((l) => (
            <span
              key={l}
              className="rounded-full border border-background/25 px-3 py-1.5 text-[13px] font-semibold text-background"
            >
              {l}
            </span>
          ))}
        </div>
      </InvertedBand>

      {/* Founder note */}
      <section data-test-id="house-founder">
        <Container className="max-w-[760px] py-12 sm:py-16">
          <SectionLabel>{t('founderEyebrow')}</SectionLabel>
          <blockquote className="mt-4 text-[18px] font-medium leading-[1.6] text-foreground sm:text-[20px]">
            {t('founderNote')}
          </blockquote>
          <div className="mt-6 flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <LayoutGrid size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-heading text-[15px] font-bold">{t('founderSignName')}</p>
              <p className="text-[14px] text-muted-foreground">{t('founderSignRole')}</p>
            </div>
          </div>
        </Container>
      </section>

      {/* CTA band */}
      <CtaBand title={t('ctaTitle')} subtitle={t('ctaSubtitle')} data-test-id="house-cta">
        <a
          href={mailto}
          className="inline-flex max-w-full items-center gap-2 rounded-full bg-primary-foreground px-6 py-3.5 font-heading text-[16px] font-bold text-primary no-underline transition-transform hover:-translate-y-0.5"
          data-test-id="house-cta-email"
        >
          <span className="truncate">{CONTACT_EMAIL}</span>
          <ArrowRight size={17} className="shrink-0" />
        </a>
      </CtaBand>

      {/* Footer */}
      <footer className="border-t border-border">
        <Container className="py-10">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-[420px]">
              <Brand size="sm" />
              <p className="mt-3 text-[14px] leading-[1.5] text-muted-foreground">{t('footerTagline')}</p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] font-medium">
              <a href="#house-services" className="text-foreground no-underline hover:text-primary">
                {t('footerServices')}
              </a>
              <a href="#house-products" className="text-foreground no-underline hover:text-primary">
                {t('footerProducts')}
              </a>
              <a href={mailto} className="text-foreground no-underline hover:text-primary">
                {t('footerWorkshops')}
              </a>
              <a href={mailto} className="text-foreground no-underline hover:text-primary">
                {t('footerContact')}
              </a>
            </nav>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <p className="text-[13px] text-muted-foreground">{t('copyright', { year: 2026 })}</p>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <LandingLangSwitch locale={locale} />
            </div>
          </div>
        </Container>
      </footer>
    </div>
  )
}
