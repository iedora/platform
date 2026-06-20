import { hc } from 'hono/client'
import type { MenuApp } from '@iedora/service-menu/app'
import { MENU_URL } from './config'
import { authedFetch } from './server-fetch'

/**
 * Typed Hono RPC client for the menu service (`services/menu`).
 *
 * End-to-end type safety straight from the Hono route definitions — no
 * codegen, no hand-mirrored DTOs. Server-only: every request injects the
 * caller's Bearer token from cookies (with the same one-shot 401-refresh
 * retry as `serverFetch`) and is uncached.
 *
 * Usage (in a server component / server action):
 *   const res = await menu.api.analytics.$get({ query: { range: '7d' } })
 *   if (res.ok) { const data = await res.json() }  // data is typed
 */

// Precompiled client type — Hono recommends this so TS instantiates the
// (large) MenuApp route type at build time, not on every IDE keystroke.
export type MenuClient = ReturnType<typeof hc<MenuApp>>

const make = (...args: Parameters<typeof hc>): MenuClient => hc<MenuApp>(...args)

export const menu: MenuClient = make(MENU_URL, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    authedFetch(typeof input === 'string' ? input : input.toString(), init),
})
