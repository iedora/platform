'use client'

import { useEffect } from 'react'

/**
 * Client island that highlights the category chip for the section currently
 * under the sticky nav, and keeps that chip centred in the horizontally
 * scrolling strip. It renders nothing: the nav and its links are server HTML
 * (see {@link CategoryNav}). This only reads scroll position and flips the
 * `data-active` attribute (and `aria-current`) on the pre-rendered chips, so
 * with JS off the markup is still a complete, working anchor nav.
 *
 * Active tracking is plain scroll math — the last section whose top has crossed
 * below the nav — which behaves identically from a 320px iPhone to desktop with
 * no per-template threshold tuning.
 */
export function CategoryScrollSpy({ navId, ids }: { navId: string; ids: string[] }) {
  useEffect(() => {
    const nav = document.getElementById(navId)
    if (!nav) return
    const sections = ids
      .map((id) => document.getElementById(`cat-${id}`))
      .filter((el): el is HTMLElement => el !== null)
    if (sections.length === 0) return

    let frame = 0
    let activeId = ''

    const apply = (id: string) => {
      if (id === activeId) return
      activeId = id
      for (const candidate of ids) {
        const chip = nav.querySelector<HTMLElement>(`[data-cat="${candidate}"]`)
        if (!chip) continue
        const on = candidate === id
        chip.setAttribute('data-active', on ? 'true' : 'false')
        if (on) chip.setAttribute('aria-current', 'true')
        else chip.removeAttribute('aria-current')
      }
      const active = nav.querySelector<HTMLElement>(`[data-cat="${id}"]`)
      if (active) {
        nav.scrollTo({
          left: active.offsetLeft - nav.clientWidth / 2 + active.clientWidth / 2,
          behavior: 'smooth',
        })
      }
    }

    const update = () => {
      frame = 0
      const line = nav.offsetHeight + 12
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2
      let current = sections[0]!.id
      if (atBottom) {
        current = sections[sections.length - 1]!.id
      } else {
        for (const el of sections) {
          if (el.getBoundingClientRect().top <= line) current = el.id
          else break
        }
      }
      apply(current.slice('cat-'.length))
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [navId, ids])

  return null
}
