import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { cookieNames, authConfig } from '@iedora/auth-sdk/next'
const ACCESS_COOKIE = cookieNames(authConfig.cookiePrefix).access

// next/headers can't load in a plain node test; mock a controllable cookie store.
const hoist = vi.hoisted(() => ({ store: null as unknown }))
vi.mock('next/headers', () => ({ cookies: async () => hoist.store }))

const { apiJson } = await import('./menu-fetch')

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
/** A decodable (unsigned) access JWT — decodeJwt never verifies signatures. */
function accessToken(expSec: number): string {
  return `${b64url({ alg: 'EdDSA' })}.${b64url({ sub: 'u1', typ: 'access', exp: expSec })}.sig`
}
const future = () => Math.floor(Date.now() / 1000) + 600

function makeStore(init: Record<string, string>) {
  const m = new Map(Object.entries(init))
  return {
    get: (n: string) => (m.has(n) ? { name: n, value: m.get(n)! } : undefined),
    getAll: () => [...m.entries()].map(([name, value]) => ({ name, value })),
    set: () => {},
  }
}

beforeEach(() => {
  hoist.store = makeStore({ [ACCESS_COOKIE]: accessToken(future()) })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

// apiJson surfaces the backend error body as ApiError.message.

test('apiJson surfaces a plain-text error body (Hono HTTPException) as the message', async () => {
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
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 500, statusText: 'Internal Server Error', text: async () => '' })),
  )
  await expect(apiJson('/api/x')).rejects.toMatchObject({ status: 500, message: 'Internal Server Error' })
})
