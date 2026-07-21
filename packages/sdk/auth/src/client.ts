import {
  type AdminSession,
  type AdminUser,
  type AdminUserDetail,
  AuthError,
  type AuthSession,
  type Organization,
  type OrgMember,
  type OrgWithOwner,
  type ProviderOption,
  type Role,
  type ServiceTokenResponse,
  type SessionView,
  type SwitchResult,
  type TokenBundle,
  type WhoAmI,
} from "./types"

export type AuthClientOptions = {
  /** The auth service's public URL, e.g. https://auth.example.com. */
  baseUrl: string
  /** Your product's tenant slug. */
  tenant: string
  /** Override the fetch implementation (tests, custom agents). */
  fetch?: typeof fetch
}

// Plain-object headers keep this portable across runtimes (Bun/Node/edge)
// without depending on an ambient `HeadersInit` lib type that would leak into
// every consumer's type environment.
type CallOpts = { method?: string; body?: unknown; headers?: Record<string, string>; allow?: number[] }

/**
 * A typed client for the tenant-scoped auth API. One instance is bound to a single
 * tenant, so calls read cleanly:
 *
 * ```ts
 * const auth = createAuthClient({ baseUrl: "https://auth.example.com", tenant: "acme" })
 * const session = await auth.login({ email, password })
 * const fresh = await auth.refresh(session.refreshToken)
 * ```
 */
export function createAuthClient(opts: AuthClientOptions) {
  const base = opts.baseUrl.replace(/\/$/, "")
  const tenant = opts.tenant
  const doFetch = opts.fetch ?? fetch

  async function call<T>(path: string, o?: CallOpts): Promise<T> {
    const headers = new Headers(o?.headers)
    let body: string | undefined
    if (o?.body !== undefined) {
      headers.set("content-type", "application/json")
      body = JSON.stringify(o.body)
    }
    const res = await doFetch(`${base}/${tenant}${path}`, {
      method: o?.method ?? "GET",
      headers,
      body,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const e = data as { error?: string; message?: string }
      throw new AuthError(res.status, e.error ?? "request_failed", e.message)
    }
    return data as T
  }

  const auth = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` })

  return {
    /** POST /register — email + password sign-up. */
    register: (input: { email: string; password: string; name?: string }) =>
      call<AuthSession>("/register", { method: "POST", body: input }),

    /** POST /login — email + password. */
    login: (input: { email: string; password: string }) =>
      call<AuthSession>("/login", { method: "POST", body: input }),

    /** POST /refresh — rotate the refresh token (the old one is revoked). */
    refresh: (refreshToken: string) =>
      call<TokenBundle>("/refresh", { method: "POST", body: { refreshToken } }),

    /** POST /logout — revoke the refresh session family. */
    logout: (refreshToken: string) =>
      call<{ ok: true }>("/logout", { method: "POST", body: { refreshToken } }),

    /** GET /whoami — the caller with a live mustChangePassword (prefer local verify
     *  for auth; use this for the forced-change gate). */
    whoami: (accessToken: string) => call<WhoAmI>("/whoami", { headers: auth(accessToken) }),

    /** GET /providers — the enabled sign-in options, for rendering a login UI. */
    providers: () => call<{ providers: ProviderOption[] }>("/providers"),

    /** Build the URL to start an external OAuth flow (redirect the browser here). */
    oauthAuthorizeUrl: (provider: string) => `${base}/${tenant}/oauth/${provider}/authorize`,

    /* ---------------------------- password reset --------------------------- */

    /** POST /forgot-password — always resolves (never reveals whether the email exists). */
    forgotPassword: (email: string) =>
      call<{ ok: true }>("/forgot-password", { method: "POST", body: { email } }),

    /** POST /reset-password — complete a reset with the emailed token. */
    resetPassword: (token: string, password: string) =>
      call<{ ok: true }>("/reset-password", { method: "POST", body: { token, password } }),

    /* ------------------------------- account ------------------------------- */

    /** POST /change-password — currentPassword required unless a change is forced. */
    changePassword: (
      accessToken: string,
      input: { currentPassword?: string; newPassword: string },
    ) => call<{ ok: true }>("/change-password", { method: "POST", body: input, headers: auth(accessToken) }),

    /** GET /sessions — the caller's devices. */
    listSessions: (accessToken: string) =>
      call<{ sessions: SessionView[] }>("/sessions", { headers: auth(accessToken) }),

    /** POST /sessions/:family/revoke — sign out one device. */
    revokeSession: (accessToken: string, family: string) =>
      call<{ ok: true }>(`/sessions/${encodeURIComponent(family)}/revoke`, {
        method: "POST",
        headers: auth(accessToken),
      }),

    /** POST /sessions/revoke-others — sign out every other device. */
    revokeOtherSessions: (accessToken: string) =>
      call<{ ok: true }>("/sessions/revoke-others", { method: "POST", headers: auth(accessToken) }),

    /* ----------------------------- organizations --------------------------- */

    /** POST /organizations — create an org; the caller becomes its owner. */
    createOrganization: (accessToken: string, input: { name: string; slug?: string }) =>
      call<{ id: string; slug: string; name: string }>("/organizations", {
        method: "POST",
        body: input,
        headers: auth(accessToken),
      }),

    /** GET /organizations — the caller's orgs + role in each. */
    listOrganizations: (accessToken: string) =>
      call<{ organizations: Organization[] }>("/organizations", { headers: auth(accessToken) }),

    /** POST /organizations/:org/switch — set active org; returns a fresh access token. */
    switchOrganization: (accessToken: string, orgId: string) =>
      call<SwitchResult>(`/organizations/${encodeURIComponent(orgId)}/switch`, {
        method: "POST",
        headers: auth(accessToken),
      }),

    /** GET /organizations/:org/members */
    listMembers: (accessToken: string, orgId: string) =>
      call<{ members: OrgMember[] }>(`/organizations/${encodeURIComponent(orgId)}/members`, {
        headers: auth(accessToken),
      }),

    /** POST /organizations/:org/members — add an existing user by email. */
    addMember: (accessToken: string, orgId: string, input: { email: string; role?: Role }) =>
      call<OrgMember>(`/organizations/${encodeURIComponent(orgId)}/members`, {
        method: "POST",
        body: input,
        headers: auth(accessToken),
      }),

    /** PATCH /organizations/:org/members/:userId — change a member's role. */
    updateMemberRole: (accessToken: string, orgId: string, userId: string, role: Role) =>
      call<{ ok: true }>(
        `/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
        { method: "PATCH", body: { role }, headers: auth(accessToken) },
      ),

    /** DELETE /organizations/:org/members/:userId — remove a member. */
    removeMember: (accessToken: string, orgId: string, userId: string) =>
      call<{ ok: true }>(
        `/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
        { method: "DELETE", headers: auth(accessToken) },
      ),
  }
}

export type AuthClient = ReturnType<typeof createAuthClient>

/* -------------------------- machine-to-machine --------------------------- */

/** Mint a service token via the client-credentials grant (HTTP Basic). */
export async function mintServiceToken(
  baseUrl: string,
  clientId: string,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ServiceTokenResponse> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/token`, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${clientId}:${secret}`)}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = data as { error?: string; message?: string }
    throw new AuthError(res.status, e.error ?? "invalid_client", e.message)
  }
  return data as ServiceTokenResponse
}

export type ManageClientOptions = {
  baseUrl: string
  /** A service token, or a provider that returns one (e.g. a cached minter). */
  token: string | (() => string | Promise<string>)
  fetch?: typeof fetch
}

/**
 * Server-side admin client for the `/manage` API (Users CRM + org administration),
 * scoped to the service token's tenant. `getUser`/`getOrganization` return null on
 * 404 so callers can 404 cleanly.
 */
export function createManageClient(opts: ManageClientOptions) {
  const base = opts.baseUrl.replace(/\/$/, "")
  const doFetch = opts.fetch ?? fetch
  const resolveToken = () => (typeof opts.token === "function" ? opts.token() : opts.token)

  async function call<T>(path: string, o?: CallOpts): Promise<T> {
    const headers = new Headers(o?.headers)
    headers.set("authorization", `Bearer ${await resolveToken()}`)
    let body: string | undefined
    if (o?.body !== undefined) {
      headers.set("content-type", "application/json")
      body = JSON.stringify(o.body)
    }
    const res = await doFetch(`${base}${path}`, { method: o?.method ?? "GET", headers, body })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (o?.allow?.includes(res.status)) return null as T
      const e = data as { error?: string; message?: string }
      throw new AuthError(res.status, e.error ?? "request_failed", e.message)
    }
    return data as T
  }

  return {
    listUsers: (q?: string) =>
      call<{ users: AdminUser[] }>(`/manage/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    getUser: (id: string) =>
      call<AdminUserDetail | null>(`/manage/users/${encodeURIComponent(id)}`, { allow: [404] }),
    getUserSessions: (id: string) =>
      call<{ sessions: AdminSession[] }>(`/manage/users/${encodeURIComponent(id)}/sessions`),
    forcePasswordChange: (id: string) =>
      call<{ ok: true }>(`/manage/users/${encodeURIComponent(id)}/force-password-change`, { method: "POST" }),
    setUserPassword: (id: string, password: string) =>
      call<{ ok: true }>(`/manage/users/${encodeURIComponent(id)}/set-password`, {
        method: "POST",
        body: { password },
      }),
    revokeUserSession: (id: string, family: string) =>
      call<{ ok: true }>(
        `/manage/users/${encodeURIComponent(id)}/sessions/${encodeURIComponent(family)}/revoke`,
        { method: "POST" },
      ),
    banUser: (id: string, input: { banned: boolean; reason?: string; expiresAt?: string }) =>
      call<{ ok: true }>(`/manage/users/${encodeURIComponent(id)}/ban`, { method: "POST", body: input }),

    listOrganizations: () => call<{ organizations: OrgWithOwner[] }>("/manage/organizations"),
    getOrganization: (id: string) =>
      call<OrgWithOwner | null>(`/manage/organizations/${encodeURIComponent(id)}`, { allow: [404] }),
    provisionOrganization: (input: { name: string; ownerUserId: string; slug?: string }) =>
      call<{ id: string; slug: string; name: string }>("/manage/organizations", {
        method: "POST",
        body: input,
      }),
    transferToNewOwner: (orgId: string, input: { email: string; name: string; password: string }) =>
      call<{ ownerId: string }>(`/manage/organizations/${encodeURIComponent(orgId)}/transfer`, {
        method: "POST",
        body: input,
      }),
  }
}

export type ManageClient = ReturnType<typeof createManageClient>
