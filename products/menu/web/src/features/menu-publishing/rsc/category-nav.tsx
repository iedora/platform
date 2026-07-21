import Link from 'next/link'
import { CategoryScrollSpy } from './category-scroll-spy'

/**
 * Sticky category pills. SERVER component: the whole nav — links and labels —
 * is in the static HTML, fully crawlable and usable with JavaScript disabled.
 * Each chip is a real `<Link href="#cat-{id}">`, so navigation is native
 * in-page anchor scroll (no JS required) and search engines see ordinary links.
 *
 * The active-section highlight is the ONLY client behaviour, isolated in the
 * {@link CategoryScrollSpy} island below. It renders nothing — it just flips a
 * `data-active` attribute on the pre-rendered chips as you scroll, so the JS is
 * a progressive enhancement layered over server HTML, never the source of it.
 * Active styling lives in CSS (the `data-[active=true]:` variants), so it too
 * is present in the initial markup.
 */

export interface CategoryNavItem {
  id: string
  label: string
}

const NAV_ID = 'menu-category-nav'

const NAV_CLASS: Record<'classic' | 'cards', string> = {
  classic:
    'sticky top-0 z-10 -mx-5 mb-2 flex gap-2 overflow-x-auto bg-white/90 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  cards:
    'sticky top-0 z-10 flex gap-2 overflow-x-auto bg-[#fafaf7]/90 px-4 py-3 backdrop-blur sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
}

const CHIP_CLASS: Record<'classic' | 'cards', string> = {
  classic:
    'shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium no-underline transition-colors ' +
    'border-[color:var(--menu-secondary)] text-[color:var(--menu-primary)] ' +
    'data-[active=true]:border-[color:var(--menu-primary)] data-[active=true]:bg-[color:var(--menu-primary)] data-[active=true]:text-white',
  cards:
    'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium no-underline transition-all ' +
    'bg-white text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_-2px_rgba(0,0,0,0.08)] ' +
    'hover:shadow-[0_2px_6px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.12)] ' +
    'data-[active=true]:bg-[color:var(--menu-primary)] data-[active=true]:text-white ' +
    'data-[active=true]:shadow-[0_2px_6px_rgba(0,0,0,0.12),0_8px_24px_-8px_rgba(0,0,0,0.18)]',
}

export function CategoryNav({
  items,
  variant,
  ariaLabel,
}: {
  items: CategoryNavItem[]
  variant: 'classic' | 'cards'
  ariaLabel: string
}) {
  return (
    <>
      <nav id={NAV_ID} aria-label={ariaLabel} className={NAV_CLASS[variant]}>
        {items.map((it, i) => (
          <Link
            key={it.id}
            href={`#cat-${it.id}`}
            data-cat={it.id}
            // First chip is active in the static HTML — it's what's on screen at
            // the top, and it avoids a highlight flash before hydration. The
            // scroll-spy corrects it as the diner scrolls.
            data-active={i === 0 ? 'true' : 'false'}
            aria-current={i === 0 ? 'true' : undefined}
            className={CHIP_CLASS[variant]}
          >
            {it.label}
          </Link>
        ))}
      </nav>
      <CategoryScrollSpy navId={NAV_ID} ids={items.map((it) => it.id)} />
    </>
  )
}
