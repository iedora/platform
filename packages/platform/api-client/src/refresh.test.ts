import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { ACCESS_COOKIE, REFRESH_COOKIE } from './cookies'

// next/headers can't load in a plain node test, and we need a controllable
// cookie store anyway — so mock it. `hoist.store` is swapped per test.
const hoist = vi.hoisted(() => ({ store: null as unknown }))
vi.mock('next/headers', () => ({ cookies: async () => hoist.store }))

// Imported AFTER the mock so session.ts picks up the mocked next/headers.
const { getSession } = await import('./session')
const { resolveAuth } = await import('./middleware')

// ── helpers ──────────────────────────────────────────────────────────────

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
/** A decodable (unsigned) access JWT — decodeJwt never verifies signatures. */
function accessToken(expSec: number): string {
  return `${b64url({ alg: 'EdDSA' })}.${b64url({ sub: 'u1', typ: 'access', roles: ['iedora-admin'], exp: expSec })}.sig`
}
const future = () => Math.floor(Date.now() / 1000) + 600
const past = () => Math.floor(Date.now() / 1000) - 600

type FakeStore = {
  get: (n: string) => { name: string; value: string } | undefined
  getAll: () => { name: string; value: string }[]
  set: (n: string, v: string, o?: unknown) => void
  writes: { name: string; value: string }[]
}
/** A Next-cookie-store stand-in. `writable:false` throws on set() to emulate
 *  an RSC render (read-only), mirroring Next's real behaviour. */
function makeStore(init: Record<string, string>, { writable = true } = {}): FakeStore {
  const m = new Map(Object.entries(init))
  const writes: { name: string; value: string }[] = []
  return {
    get: (n) => (m.has(n) ? { name: n, value: m.get(n)! } : undefined),
    getAll: () => [...m.entries()].map(([name, value]) => ({ name, value })),
    set: (n, v) => {
      if (!writable) throw new Error('Cookies can only be modified in a Server Action or Route Handler.')
      writes.push({ name: n, value: v })
      m.set(n, v)
    },
    writes,
  }
}

/** Stubs the auth-service /auth/refresh round-trip. */
function mockRefreshOk(newRefresh = 'rt2', newAccess = accessToken(future())) {
  const f = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      accessToken: newAccess,
      expiresAt: new Date(Date.now() + 9e5).toISOString(),
      refreshToken: newRefresh,
      refreshExpiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
      userId: 'u1',
    }),
    headers: { getSetCookie: () => [] },
  }))
  vi.stubGlobal('fetch', f)
  return f
}
function mockRefreshDead() {
  const f = vi.fn(async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: async () => ({ error: 'dead' }),
    text: async () => JSON.stringify({ error: 'dead' }),
    headers: { getSetCookie: () => [] },
  }))
  vi.stubGlobal('fetch', f)
  return f
}

function makeReq(cookies: Record<string, string>): NextRequest {
  const m = new Map(Object.entries(cookies))
  return {
    cookies: {
      get: (n: string) => (m.has(n) ? { name: n, value: m.get(n)! } : undefined),
      getAll: () => [...m.entries()].map(([name, value]) => ({ name, value })),
    },
    headers: new Headers(),
  } as unknown as NextRequest
}

beforeEach(() => {
  hoist.store = null
})
afterEach(() => {
  vi.unstubAllGlobals()
})

// ── getSession (the guard self-heal) ─────────────────────────────────────

test('getSession returns the principal from a valid access cookie, no refresh', async () => {
  hoist.store = makeStore({ [ACCESS_COOKIE]: accessToken(future()) })
  const f = vi.fn()
  vi.stubGlobal('fetch', f)
  const s = await getSession()
  expect(s?.userId).toBe('u1')
  expect(f).not.toHaveBeenCalled()
})

test('getSession returns null when unauthenticated', async () => {
  hoist.store = makeStore({})
  expect(await getSession()).toBeNull()
})

test('getSession self-heals an expired access token in a writable (server action) context', async () => {
  hoist.store = makeStore({ [ACCESS_COOKIE]: accessToken(past()), [REFRESH_COOKIE]: 'rt1' }, { writable: true })
  const f = mockRefreshOk('rt2')
  const store = hoist.store as FakeStore

  const s = await getSession()

  expect(s?.userId).toBe('u1')
  expect(f).toHaveBeenCalledTimes(1)
  // Persisted the ROTATED refresh token + the new access token.
  expect(store.writes.some((w) => w.name === REFRESH_COOKIE && w.value === 'rt2')).toBe(true)
  expect(store.writes.some((w) => w.name === ACCESS_COOKIE)).toBe(true)
})

test('getSession does NOT refresh in a read-only RSC context (avoids reuse-detection)', async () => {
  hoist.store = makeStore({ [ACCESS_COOKIE]: accessToken(past()), [REFRESH_COOKIE]: 'rt1' }, { writable: false })
  const f = vi.fn()
  vi.stubGlobal('fetch', f)

  const s = await getSession()

  expect(s).toBeNull()
  // Critically: never rotated, so no orphaned refresh token to burn the family.
  expect(f).not.toHaveBeenCalled()
})

test('getSession returns null when the refresh token is dead', async () => {
  hoist.store = makeStore({ [ACCESS_COOKIE]: accessToken(past()), [REFRESH_COOKIE]: 'rt1' }, { writable: true })
  mockRefreshDead()
  expect(await getSession()).toBeNull()
})

// ── resolveAuth (the middleware refresh) ─────────────────────────────────

test('resolveAuth passes a valid access cookie through without refreshing', async () => {
  const f = vi.fn()
  vi.stubGlobal('fetch', f)
  const r = await resolveAuth(makeReq({ [ACCESS_COOKIE]: accessToken(future()) }))
  expect(r.session?.userId).toBe('u1')
  expect(r.cookieWrites).toHaveLength(0)
  expect(f).not.toHaveBeenCalled()
})

test('resolveAuth refreshes an expired access token and rewrites the request cookies', async () => {
  mockRefreshOk('rt2')
  const r = await resolveAuth(makeReq({ [ACCESS_COOKIE]: accessToken(past()), [REFRESH_COOKIE]: 'rt1' }))
  expect(r.session?.userId).toBe('u1')
  expect(r.cookieWrites.some((c) => c.name === REFRESH_COOKIE && c.value === 'rt2')).toBe(true)
  // Downstream render sees the fresh cookie immediately.
  expect(r.requestHeaders?.get('cookie')).toContain(`${REFRESH_COOKIE}=rt2`)
})

test('resolveAuth clears the cookies when the refresh token is dead', async () => {
  mockRefreshDead()
  const r = await resolveAuth(makeReq({ [ACCESS_COOKIE]: accessToken(past()), [REFRESH_COOKIE]: 'rt1' }))
  expect(r.session).toBeNull()
  expect(r.cookieWrites.length).toBeGreaterThan(0)
  expect(r.cookieWrites.every((c) => c.value === '')).toBe(true) // deletions
})

test('resolveAuth returns null with no writes when there is nothing to refresh', async () => {
  const r = await resolveAuth(makeReq({}))
  expect(r.session).toBeNull()
  expect(r.cookieWrites).toHaveLength(0)
})

// ── serverFetch (the data-layer refresh-on-401) ──────────────────────────

const { serverFetch, apiJson } = await import('./server-fetch')

// ── apiJson detailed error surfacing ─────────────────────────────────────

test('apiJson surfaces a plain-text error body (Hono HTTPException) as the message', async () => {
  hoist.store = makeStore({ [ACCESS_COOKIE]: accessToken(future()) })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => 'the restaurant already belongs to that tenant',
    })),
  )
  await expect(apiJson('/api/x')).rejects.toMatchObject({
    status: 422,
    message: 'the restaurant already belongs to that tenant',
  })
})

test('apiJson prefers a JSON { error } body over the raw text', async () => {
  hoist.store = makeStore({ [ACCESS_COOKIE]: accessToken(future()) })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      text: async () => JSON.stringify({ error: 'email already in use' }),
    })),
  )
  await expect(apiJson('/api/x')).rejects.toMatchObject({ status: 409, message: 'email already in use' })
})

test('apiJson falls back to status text when the error body is empty', async () => {
  hoist.store = makeStore({ [ACCESS_COOKIE]: accessToken(future()) })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 500, statusText: 'Internal Server Error', text: async () => '' })),
  )
  await expect(apiJson('/api/x')).rejects.toMatchObject({ status: 500, message: 'Internal Server Error' })
})

test('serverFetch refreshes on a 401 and retries with the rotated token', async () => {
  hoist.store = makeStore({ [ACCESS_COOKIE]: accessToken(past()), [REFRESH_COOKIE]: 'rt1' }, { writable: true })
  let menuCalls = 0
  const f = vi.fn(async (url: string) => {
    if (url.includes('/auth/refresh')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: accessToken(future()),
          expiresAt: new Date(Date.now() + 9e5).toISOString(),
          refreshToken: 'rt2',
          refreshExpiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
          userId: 'u1',
        }),
        headers: { getSetCookie: () => [] },
      }
    }
    menuCalls += 1
    return menuCalls === 1
      ? { ok: false, status: 401, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => ({ ok: true }) }
  })
  vi.stubGlobal('fetch', f)

  const res = await serverFetch('/api/restaurants')

  expect(res.status).toBe(200)
  expect(menuCalls).toBe(2) // initial 401 + retry
  const store = hoist.store as FakeStore
  expect(store.writes.some((w) => w.name === REFRESH_COOKIE && w.value === 'rt2')).toBe(true)
})
