import { writeFileSync } from 'node:fs'

const port = parseInt(process.env.SHIM_PORT ?? '4444', 10)
const url = `http://127.0.0.1:${port}`

declare const Bun: {
  serve: (options: {
    port: number
    fetch: (req: Request) => Promise<Response> | Response
  }) => unknown
}

writeFileSync(
  new URL('./.testkit.json', import.meta.url),
  JSON.stringify({ url }),
)

/**
 * Zitadel mock — minimal shim that lets menu's auth slice resolve a user's
 * primary org without a real Zitadel. The mappings are mutable so tests
 * that exercise multi-tenant behaviour can register distinct users → orgs
 * via `POST /test/user-orgs` (see `@/features/identity/testing/seeds.ts`).
 *
 * Endpoints:
 *   GET  /.well-known/openid-configuration              — OIDC discovery
 *   POST /zitadel.user.v2.UserService/ListUserMetadata  — returns the
 *        primaryOrgId for the requested userId (default: o1)
 *   POST /v2/organizations/_search                       — returns
 *        registered orgs, or [{ id: o1 }] when none registered
 *   POST /test/user-orgs                                — register {userId, organizationId}
 *   POST /test/reset                                    — clear registry
 *
 * Real OIDC token exchange / JWKS are NOT implemented; tests bypass the
 * code-exchange dance via `signInAs` in `@/features/auth/testing` (cookie
 * injection). Add token/JWKS endpoints when an E2E spec needs the full
 * auth-code flow (Phase 4).
 */

type Mappings = {
  userToOrg: Map<string, string>
  orgs: Map<string, { id: string; name: string; primaryDomain: string }>
}

const state: Mappings = {
  userToOrg: new Map(),
  orgs: new Map([
    ['o1', { id: 'o1', name: 'Org One', primaryDomain: 'iedora.com' }],
  ]),
}

function registerOrg(id: string, name = id, primaryDomain = `${id}.iedora.test`) {
  state.orgs.set(id, { id, name, primaryDomain })
}

function readBody(req: Request) {
  return req.json().catch(() => ({}) as Record<string, unknown>)
}

const enc = (s: string) => Buffer.from(s, 'utf8').toString('base64')

Bun.serve({
  port,
  async fetch(req: Request) {
    const path = new URL(req.url).pathname
    if (process.env.SHIM_VERBOSE === '1') {
      console.log(`[zitadel-mock] ${req.method} ${path}`)
    }

    if (path === '/.well-known/openid-configuration') {
      return Response.json({
        issuer: url,
        authorization_endpoint: `${url}/oauth/v2/authorize`,
        token_endpoint: `${url}/oauth/v2/token`,
        userinfo_endpoint: `${url}/oauth/v2/userinfo`,
        end_session_endpoint: `${url}/oauth/v2/logout`,
        jwks_uri: `${url}/oauth/v2/keys`,
      })
    }

    if (path === '/test/user-orgs' && req.method === 'POST') {
      const body = (await readBody(req)) as { userId?: string; organizationId?: string; name?: string }
      if (!body.userId || !body.organizationId) {
        return new Response('userId + organizationId required', { status: 400 })
      }
      registerOrg(body.organizationId, body.name)
      state.userToOrg.set(body.userId, body.organizationId)
      return Response.json({ ok: true })
    }

    if (path === '/test/reset' && req.method === 'POST') {
      state.userToOrg.clear()
      state.orgs.clear()
      registerOrg('o1', 'Org One', 'iedora.com')
      return Response.json({ ok: true })
    }

    if (path === '/zitadel.user.v2.UserService/ListUserMetadata') {
      const body = (await readBody(req)) as { userId?: string }
      const orgId =
        (body.userId && state.userToOrg.get(body.userId)) ?? 'o1'
      return Response.json({
        metadata: [{ key: 'primaryOrgId', value: enc(orgId) }],
      })
    }

    if (path === '/v2/organizations/_search') {
      return Response.json({ result: Array.from(state.orgs.values()) })
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.log(`[zitadel-mock] Stub server listening on ${url}`)
