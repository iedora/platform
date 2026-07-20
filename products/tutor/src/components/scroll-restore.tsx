"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useLayoutEffect, useRef } from "react"

/**
 * Restores scroll position on back/forward for a nested scroll container.
 *
 * The app shell scrolls `<main>`, not the document. Neither the browser's native
 * scroll restoration nor Next's own handling tracks a nested scroller — both only
 * know about the document scroller, which in an `h-dvh` shell never moves. So
 * going back to a tutor profile always landed at the top. This owns the problem.
 *
 * Keyed by history entry, not by pathname: the same route can sit in the stack
 * twice (profile → reviews → profile), and pathname keys would have those two
 * entries clobber each other's offset.
 */
const PREFIX = "scroll"
const RESTORE_TIMEOUT_MS = 1500

/** The shell's scroll container. Shared by the component and the inline script. */
export const SCROLL_ID = "app-scroll"

/*
 * There used to be a parse-time inline <script> here that restored scroll before
 * the first paint on a hard reload. It's gone on purpose. React 19 (Next 16.2+)
 * refuses to execute inline scripts it renders on the client and warns for any
 * <script> in the reconciled tree; the escapes all have worse failure modes here:
 *  - returning null on the client (`typeof window` guard) makes the server tree
 *    and client tree diverge at this position -> hydration mismatch;
 *  - useServerInsertedHTML / next/script inject into <head>, where the script runs
 *    before #app-scroll exists, so it can't restore a nested scroller at all.
 * So restoration is owned entirely by the useLayoutEffect below. That covers every
 * client navigation with no flicker; the only regression is a possible top-then-jump
 * on a hard reload of a deep-scrolled page, which isn't worth fighting the model for.
 */

function read(key: string): number {
  return Number(sessionStorage.getItem(`${PREFIX}:${key}`) ?? "0")
}
function write(key: string, top: number) {
  sessionStorage.setItem(`${PREFIX}:${key}`, String(top))
}

/** A stable id stamped into the current history entry. */
function historyKey(): string {
  const state = (window.history.state ?? {}) as Record<string, unknown>
  if (typeof state.scrollKey === "string") return state.scrollKey

  const key = Math.random().toString(36).slice(2)
  // Spread, never replace: the App Router keeps its own routing fields in
  // history.state and clobbering them breaks navigation.
  window.history.replaceState({ ...state, scrollKey: key }, "")
  return key
}

export function ScrollRestore({ targetId }: { targetId: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const keyRef = useRef("")

  useEffect(() => {
    // Take ownership, so the browser isn't also trying to restore the document.
    history.scrollRestoration = "manual"
  }, [])

  // Record where the user is, continuously, against the current history entry.
  useEffect(() => {
    const el = document.getElementById(targetId)
    if (!el) return

    // Written synchronously rather than throttled through requestAnimationFrame:
    // rAF doesn't run while the tab isn't painting, and a frame still pending
    // across a navigation would write the outgoing position under the incoming
    // key. A setItem of one short string per scroll event is cheap enough.
    const save = () => {
      if (keyRef.current) write(keyRef.current, el.scrollTop)
    }

    el.addEventListener("scroll", save, { passive: true })
    // pagehide rather than beforeunload — the latter disqualifies the page from
    // the back/forward cache, which is the thing we're trying to feel like.
    window.addEventListener("pagehide", save)
    return () => {
      el.removeEventListener("scroll", save)
      window.removeEventListener("pagehide", save)
      save()
    }
  }, [targetId])

  // Restore before paint, so there's no flash of the top of the page.
  useLayoutEffect(() => {
    const el = document.getElementById(targetId)
    if (!el) return

    keyRef.current = historyKey()

    // No popstate flag: a fresh push lands on a history entry with no key yet, so
    // historyKey() mints one, nothing is stored against it, and the page opens at
    // the top on its own. Going back finds the entry's existing key and its saved
    // offset. That makes this idempotent, which a one-shot "did we pop?" ref is
    // not — React double-invokes effects in dev, and the second pass would see the
    // flag already consumed and slam the page back to the top.
    const target = read(keyRef.current)
    if (target === 0) {
      el.scrollTop = 0
      return
    }

    // The page streams in, so the container often isn't tall enough yet and the
    // assignment silently clamps. Keep trying as content lands, then give up
    // rather than yank a user who has started scrolling on their own.
    const scroll = () => {
      el.scrollTop = target
      return Math.abs(el.scrollTop - target) < 2
    }
    if (scroll()) return

    const observer = new ResizeObserver(() => {
      if (scroll()) stop()
    })
    observer.observe(el)
    for (const child of el.children) observer.observe(child)

    const timer = setTimeout(stop, RESTORE_TIMEOUT_MS)
    function stop() {
      clearTimeout(timer)
      observer.disconnect()
    }
    return stop
  }, [targetId, pathname, searchParams])

  return null
}
