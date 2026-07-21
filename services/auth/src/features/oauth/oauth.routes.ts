import crypto from "node:crypto"
import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"

import { issueTokens, upsertOAuthUser } from "../../platform/accounts"
import { config } from "../../platform/config"
import { type Env, HttpError, reqContext } from "../../platform/http"
import { pkce } from "../../platform/providers/oauth"
import { resolveProvider } from "../../platform/providers/registry"

function callbackUri(tenantSlug: string, providerId: string): string {
  return `${config.issuerUrl}/${tenantSlug}/oauth/${providerId}/callback`
}

const secureCookies = config.issuerUrl.startsWith("https")
const shortCookie = {
  httpOnly: true,
  secure: secureCookies,
  sameSite: "Lax" as const,
  path: "/",
  maxAge: 600,
}

/** A post-login redirect target is honored only when its origin is in the
 *  tenant's allowedOrigins — so the flow can hand tokens to a first-party app
 *  and never an attacker-controlled URL (open-redirect guard). */
function safeRedirect(raw: string | undefined, allowed: string[]): string | null {
  if (!raw) return null
  let origin: string
  try {
    origin = new URL(raw).origin
  } catch {
    return null
  }
  return allowed.includes(origin) ? raw : null
}

/** The one flow that covers every external OAuth2/OIDC provider — the provider
 *  instance is resolved from the tenant's config, so Google/GitHub/any OIDC share
 *  this code. CSRF is blocked by a state cookie; PKCE (RFC 7636) binds the code to
 *  a secret verifier only this server holds. */
export const oauthRoutes = new Hono<Env>()
  .get("/oauth/:provider/authorize", async (c) => {
    const tenant = c.get("tenant")
    const providerId = c.req.param("provider")
    const provider = await resolveProvider(tenant, providerId)
    if (!provider || provider.kind !== "oauth2") throw new HttpError(404, "provider_not_found")

    const state = crypto.randomUUID()
    const { verifier, challenge } = pkce()
    setCookie(c, `oauth_state_${providerId}`, state, shortCookie)
    setCookie(c, `oauth_verifier_${providerId}`, verifier, shortCookie)

    // Optional first-party redirect for a browser flow (validated on callback).
    const redirect = safeRedirect(
      c.req.query("redirect"),
      (tenant.allowedOrigins as string[] | undefined) ?? [],
    )
    if (redirect) setCookie(c, `oauth_redirect_${providerId}`, redirect, shortCookie)

    return c.redirect(
      provider.authorizationUrl({
        state,
        redirectUri: callbackUri(tenant.slug, providerId),
        codeChallenge: challenge,
      }),
    )
  })
  .get("/oauth/:provider/callback", async (c) => {
    const tenant = c.get("tenant")
    const providerId = c.req.param("provider")
    const provider = await resolveProvider(tenant, providerId)
    if (!provider || provider.kind !== "oauth2") throw new HttpError(404, "provider_not_found")

    const code = c.req.query("code")
    const state = c.req.query("state")
    const cookieState = getCookie(c, `oauth_state_${providerId}`)
    const verifier = getCookie(c, `oauth_verifier_${providerId}`)
    if (!code || !state || !cookieState || state !== cookieState || !verifier) {
      throw new HttpError(400, "invalid_state")
    }
    const redirect = safeRedirect(
      getCookie(c, `oauth_redirect_${providerId}`),
      (tenant.allowedOrigins as string[] | undefined) ?? [],
    )
    for (const name of ["oauth_state", "oauth_verifier", "oauth_redirect"]) {
      deleteCookie(c, `${name}_${providerId}`, { path: "/" })
    }

    const profile = await provider.exchangeCode({
      code,
      redirectUri: callbackUri(tenant.slug, providerId),
      codeVerifier: verifier,
    })
    const user = await upsertOAuthUser(tenant, providerId, profile)
    const tokens = await issueTokens(tenant, user, { amr: ["oauth"], ...reqContext(c) })

    // Browser flow → hand the tokens to the first-party app via the URL fragment
    // (a fragment is never sent to a server, so it can't leak into logs or the
    // Referer header); the app reads them and stores its own session. Non-browser
    // callers get JSON.
    if (redirect) {
      const frag = new URLSearchParams({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: tokens.tokenType,
        expires_in: String(tokens.expiresIn),
      })
      return c.redirect(`${redirect}#${frag.toString()}`)
    }
    return c.json({ user: { id: user.id, email: user.email, name: user.name }, ...tokens })
  })
