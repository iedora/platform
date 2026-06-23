import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckIcon, MapPinIcon, PlayIcon, QrCodeIcon, StarIcon, ForkKnifeIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@iedora/ui/components/ui/button";
import { signInUrl, signUpUrl } from "@iedora/product-menu/shared/auth-urls";
import { LangSwitch } from "./lang-switch";
import { ThemeToggle } from "../../../../components/theme-toggle";

/**
 * iedora marketing landing — "the page is a menu".
 * Faithful build of the Pencil mobile design (`iedora.pen` → "Landing v2 ·
 * mobile", frame `f6JVg`): warm restaurant-menu aesthetic, dotted leaders,
 * a menu-card hero, a chalkboard specials board, pricing as two menu
 * entries (On us / Kasa) in one row. Relaxed copy, mobile-first, tight
 * scroll. Copy from the `Landing` i18n namespace (EN + PT).
 */

const SIGN_IN_HREF = signInUrl();
const SIGN_UP_HREF = signUpUrl();

const AVATAR_IMAGE =
  "https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w4NDM0ODN8MHwxfHJhbmRvbXx8fHx8fHx8fDE3ODE4MjM2MzZ8&ixlib=rb-4.1.0&q=80&w=1080";

type Dish = { name: string; price: string };
type Plan = { tier: string; price: string; per: string; badge?: string; cta: string; feats: string[] };
type FooterCol = { heading: string; links: string[] };

/** Handwritten coral accent (italic stands in for a script face, per Pencil). */
function Accent({ children, underline = false }: { children: React.ReactNode; underline?: boolean }) {
  return (
    <span className="inline-flex flex-col items-start">
      <span className="font-heading text-[15px] font-semibold italic text-primary">{children}</span>
      {underline ? (
        <svg width="64" height="7" viewBox="0 0 64 7" fill="none" className="mt-0.5 text-primary" aria-hidden="true">
          <path d="M2 4.5C11 1.5 21 6.5 32 4.5S53 1.5 62 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      ) : null}
    </span>
  );
}

/** The signature dotted menu leader filling the gap between two ends. */
function Leader() {
  return <span className="mx-2 flex-1 self-center border-b-2 border-dotted border-border" aria-hidden="true" />;
}

export default async function LandingPage() {
  const t = await getTranslations("Landing");

  const dishes = t.raw("hero.dishes") as Dish[];
  const features = t.raw("features.items") as string[];
  const steps = t.raw("how.steps") as { title: string; body: string }[];
  const bullets = t.raw("board.bullets") as string[];
  const onus = t.raw("pricing.onus") as Plan;
  const kasa = t.raw("pricing.kasa") as Plan;
  const worksWith = t.raw("worksWith") as string[];
  const footerCols = t.raw("footer.columns") as FooterCol[];
  const igHref = t("social.instagram");
  const ttHref = t("social.tiktok");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Sticky top bar ──────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-[color-mix(in_srgb,var(--background)_90%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-15 max-w-xl items-center px-5 py-3 lg:max-w-5xl">
          <Link href="/menu" className="flex items-center gap-2 no-underline">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-white"><ForkKnifeIcon size={17} weight="bold" /></span>
            <span className="font-heading text-[20px] font-extrabold tracking-[-0.02em] text-foreground">iedora</span>
          </Link>
          <ul className="ml-auto hidden items-center gap-7 lg:flex">
            {[
              { label: t("nav.features"), href: "#features" },
              { label: t("nav.how"), href: "#how" },
              { label: t("nav.pricing"), href: "#pricing" },
            ].map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-[15px] font-medium text-muted-foreground no-underline transition-colors hover:text-foreground">{l.label}</a>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-2.5 lg:ml-7">
            <LangSwitch />
            <Button render={<a href={SIGN_IN_HREF} />} nativeButton={false} variant="secondary" size="sm">{t("nav.signIn")}</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 lg:max-w-5xl">
        {/* ── Hero ──────────────────────────────────────────── */}
        <section className="py-9 lg:py-16">
          <div className="flex flex-col items-center gap-5 text-center lg:grid lg:grid-cols-2 lg:items-center lg:gap-14 lg:text-left">
            <div className="flex flex-col items-center gap-5 lg:items-start">
              <Accent underline>{t("hero.accent")}</Accent>
              <h1 className="text-[34px] font-extrabold leading-[1.08] tracking-[-0.01em] sm:text-[44px] lg:text-[54px]">{t("hero.headline")}</h1>
              <p className="max-w-md text-[16px] leading-[1.5] text-muted-foreground lg:text-[18px]">{t("hero.subhead")}</p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center lg:justify-start">
                <Button render={<a href={SIGN_UP_HREF} />} nativeButton={false} variant="default" size="lg" className="!w-full sm:!w-auto !justify-center">{t("hero.ctaPrimary")}</Button>
                <Button render={<a href="#how" />} nativeButton={false} variant="secondary" size="lg" className="!w-full sm:!w-auto !justify-center">
                  <span className="inline-flex items-center gap-2"><PlayIcon size={16} weight="fill" /> {t("hero.ctaSecondary")}</span>
                </Button>
              </div>
              {/* Works with — real brand-coloured chips */}
              <div className="flex flex-wrap items-center justify-center gap-2 text-[13px] lg:justify-start">
                <span className="italic text-muted-foreground">{t("hero.worksWithLabel")}</span>
                <a href="https://www.thefork.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-semibold text-foreground no-underline transition-colors hover:border-primary/45">
                  <span className="grid size-4 place-items-center rounded bg-[#1fa76a] text-white"><ForkKnifeIcon size={10} weight="bold" /></span> The Fork
                </a>
                <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-semibold text-foreground no-underline transition-colors hover:border-primary/45">
                  <MapPinIcon size={15} weight="fill" className="text-[#EA4335]" /> Google Maps
                </a>
              </div>
            </div>
            {/* Menu-card mockup */}
            <div className="mt-2 w-full max-w-sm -rotate-2 lg:mt-0 lg:max-w-md lg:justify-self-end">
              <div className="rounded-[24px] border border-border bg-card p-6 text-left shadow-[0_30px_70px_-28px_var(--border)]">
                <p className="font-heading text-[22px] font-extrabold text-foreground">{t("hero.card.name")}</p>
                <p className="mb-4 text-[13px] italic text-primary">{t("hero.card.note")}</p>
                <ul className="flex flex-col gap-3">
                  {dishes.map((d) => (
                    <li key={d.name} className="flex items-baseline text-[15px]">
                      <span className="font-medium text-foreground">{d.name}</span>
                      <Leader />
                      <span className="font-semibold text-foreground">{d.price}</span>
                    </li>
                  ))}
                </ul>
                <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[12.5px] font-semibold text-primary">
                  <QrCodeIcon size={14} weight="bold" /> {t("hero.card.scan")}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features as a menu listing ────────────────────── */}
        <section id="features" className="py-9">
          <Accent>{t("features.accent")}</Accent>
          <h2 className="mt-2 text-[26px] font-extrabold leading-[1.12] sm:text-[32px]">{t("features.title")}</h2>
          <ul className="mt-6 flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-x-14 lg:gap-y-5">
            {features.map((name, i) => (
              <li key={name} className="flex items-center gap-3.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[13px] font-bold text-primary">{i + 1}</span>
                <span className="font-heading text-[17px] font-bold text-foreground">{name}</span>
                <Leader />
                <CheckIcon size={17} weight="bold" className="shrink-0 text-green-600" />
              </li>
            ))}
          </ul>
        </section>
      </main>

      {/* ── Three courses (muted band) ──────────────────────── */}
      <section id="how" className="bg-muted py-10">
        <div className="mx-auto max-w-xl px-5 lg:max-w-5xl">
          <Accent>{t("how.accent")}</Accent>
          <h2 className="mt-2 text-[26px] font-extrabold leading-[1.12] sm:text-[32px]">{t("how.title")}</h2>
          <ol className="mt-6 flex flex-col gap-5 md:grid md:grid-cols-3 md:gap-7">
            {steps.map((s, i) => (
              <li key={s.title} className="flex items-center gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-heading text-[18px] font-bold text-white">{i + 1}</span>
                <div className="flex-1">
                  <h3 className="font-heading text-[17px] font-bold text-foreground">{s.title}</h3>
                  <p className="text-[14.5px] text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <main className="mx-auto max-w-xl px-5 lg:max-w-5xl">
        {/* ── Specials board (chalkboard) ───────────────────── */}
        <section className="py-9">
          <div className="rounded-[24px] bg-[var(--foreground)] p-7 text-[var(--background)]">
            <span className="font-heading text-[15px] font-semibold italic text-primary">{t("board.accent")}</span>
            <h2 className="mt-3 text-[25px] font-extrabold leading-[1.15] text-[var(--background)]">{t("board.title")}</h2>
            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-[14.5px] text-[var(--background)]">
                  <CheckIcon size={16} weight="bold" className="shrink-0 text-primary" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Pricing as two menu entries in one row ────────── */}
        <section id="pricing" className="py-9">
          <Accent>{t("pricing.accent")}</Accent>
          <h2 className="mt-2 text-[26px] font-extrabold leading-[1.12] sm:text-[32px]">{t("pricing.title")}</h2>
          <div className="mt-7 grid grid-cols-2 gap-3.5 lg:mx-auto lg:max-w-2xl lg:gap-5">
            <PlanCard plan={onus} href={SIGN_UP_HREF} />
            <PlanCard plan={kasa} href={SIGN_UP_HREF} highlighted />
          </div>
        </section>

        {/* ── Testimonial (comment card) ────────────────────── */}
        <section className="py-9">
          <div className="rotate-1 rounded-[24px] border border-border bg-card p-6 shadow-[0_24px_60px_-28px_var(--border)] lg:mx-auto lg:max-w-2xl">
            <div className="mb-3 flex gap-1 text-primary">
              {[0, 1, 2, 3, 4].map((i) => <StarIcon key={i} size={17} weight="fill" />)}
            </div>
            <blockquote className="font-heading text-[19px] font-semibold leading-[1.4] text-foreground">
              {`"${t("testimonial.quote")}"`}
            </blockquote>
            <div className="mt-5 flex items-center gap-3">
              <Image src={AVATAR_IMAGE} alt={t("testimonial.name")} width={44} height={44} className="size-11 rounded-full object-cover" />
              <div>
                <p className="text-[15px] font-bold text-foreground">{t("testimonial.name")}</p>
                <p className="text-[13px] text-muted-foreground">{t("testimonial.role")}</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── CTA band (coral) ────────────────────────────────── */}
      <section className="bg-primary px-5 py-12 text-center text-white">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
          <h2 className="text-[27px] font-extrabold leading-[1.12] sm:text-[34px]">{t("cta.title")}</h2>
          <p className="text-[16px] text-white/85">{t("cta.subhead")}</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button render={<a href={SIGN_UP_HREF} />} nativeButton={false} size="lg" className="!w-full sm:!w-auto !justify-center !bg-white !text-primary hover:!bg-white/90">{t("cta.primary")}</Button>
            <Button render={<a href={SIGN_IN_HREF} />} nativeButton={false} variant="ghost" size="lg" className="!w-full sm:!w-auto !justify-center !text-white !border-[color-mix(in_srgb,white_45%,transparent)] hover:!bg-white/10 hover:!text-white">{t("cta.secondary")}</Button>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-5 py-10 lg:max-w-5xl">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-white"><ForkKnifeIcon size={17} weight="bold" /></span>
              <span className="font-heading text-[19px] font-extrabold text-foreground">iedora</span>
            </div>
            <p className="text-[14px] text-muted-foreground">{t("footer.tagline")}</p>
            <p className="text-[12.5px] text-muted-foreground">{t("footer.langLine")}</p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            {footerCols.map((col) => (
              <div key={col.heading} className="flex flex-col gap-2.5">
                <p className="font-heading text-[13px] font-bold tracking-[0.04em] text-foreground">{col.heading}</p>
                {col.links.map((l) => (
                  <a key={l} href="#" className="text-[14px] text-muted-foreground no-underline transition-colors hover:text-foreground">{l}</a>
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border pt-5">
            <div className="flex items-center gap-3">
              <a href={igHref} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="grid size-9 place-items-center rounded-full bg-muted text-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5.5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17.5" cy="6.5" r="1.3" fill="currentColor" /></svg>
              </a>
              <a href={ttHref} target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="grid size-9 place-items-center rounded-full bg-muted text-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 3c.35 2.4 1.9 4.05 4.5 4.3v3.05c-1.5.02-2.95-.45-4.2-1.32v6.05a5.85 5.85 0 1 1-5.85-5.85c.32 0 .63.03.94.08v3.16a2.75 2.75 0 1 0 1.86 2.6V3h2.75z" fill="currentColor" /></svg>
              </a>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-[12.5px] text-muted-foreground">{t("footer.copyright")} · {worksWith.join(" · ")}</p>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PlanCard({ plan, href, highlighted = false }: { plan: Plan; href: string; highlighted?: boolean }) {
  return (
    <div className={`relative flex flex-col rounded-[18px] border bg-card p-5 ${highlighted ? "border-2 border-primary shadow-[0_18px_40px_-16px_var(--primary)]" : "border-border"}`}>
      {plan.badge ? (
        <span className="absolute -top-2.5 left-4 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-white">{plan.badge}</span>
      ) : null}
      <p className="font-heading text-[18px] font-extrabold text-foreground">{plan.tier}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="font-heading text-[28px] font-extrabold tracking-[-0.02em] text-foreground">{plan.price}</span>
        <span className="text-[13px] text-muted-foreground">{plan.per}</span>
      </p>
      <ul className="mt-3 flex flex-1 flex-col gap-2">
        {plan.feats.map((f) => (
          <li key={f} className="flex items-center gap-2 text-[13.5px]">
            <CheckIcon size={15} weight="bold" className="shrink-0 text-green-600" />
            {f}
          </li>
        ))}
      </ul>
      <Button render={<a href={href} />} nativeButton={false} variant={highlighted ? "default" : "secondary"} size="sm" className="mt-4 !w-full !justify-center">{plan.cta}</Button>
    </div>
  );
}
