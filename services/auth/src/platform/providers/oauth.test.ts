import { describe, expect, test } from "bun:test"
import crypto from "node:crypto"

import { oauthProvider, pkce } from "./oauth.ts"
import { facebook, github, google, microsoft, oauthPresets } from "./presets.ts"

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

describe("pkce", () => {
  test("challenge is the base64url S256 of the verifier (RFC 7636)", () => {
    const { verifier, challenge } = pkce()
    expect(challenge).toBe(b64url(crypto.createHash("sha256").update(verifier).digest()))
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(verifier.length).toBeGreaterThanOrEqual(43)
  })
  test("each call is unique", () => {
    expect(pkce().verifier).not.toBe(pkce().verifier)
  })
})

describe("provider presets are generic + capture email", () => {
  test("google — OIDC endpoints + email scope", () => {
    const cfg = google("cid", "sec")
    expect(cfg.authorizationEndpoint).toContain("accounts.google.com")
    expect(cfg.scope).toContain("email")
    expect(cfg.clientId).toBe("cid")
  })
  test("github — email via emailsEndpoint fallback, subject = id", () => {
    const cfg = github("cid", "sec")
    expect(cfg.userinfoEndpoint).toBe("https://api.github.com/user")
    expect(cfg.emailsEndpoint).toBe("https://api.github.com/user/emails")
    expect(cfg.subjectField).toBe("id")
    expect(cfg.scope).toContain("user:email")
  })
  test("microsoft — directory-parameterized endpoints", () => {
    expect(microsoft("c", "s", "consumers").authorizationEndpoint).toContain("/consumers/")
    expect(microsoft("c", "s").authorizationEndpoint).toContain("/common/")
  })
  test("facebook — email scope + subject = id", () => {
    const cfg = facebook("c", "s")
    expect(cfg.scope).toContain("email")
    expect(cfg.subjectField).toBe("id")
  })
  test("registry lists every static preset", () => {
    expect(Object.keys(oauthPresets).sort()).toEqual([
      "facebook",
      "github",
      "gitlab",
      "google",
      "microsoft",
    ])
  })
})

describe("generic oauthProvider carries PKCE + scope for any config", () => {
  test("authorize URL: S256 challenge, state, email scope", () => {
    const p = oauthProvider("github", github("cid", "sec"))
    const url = new URL(
      p.authorizationUrl({ state: "st", redirectUri: "https://a/cb", codeChallenge: "chal" }),
    )
    expect(url.searchParams.get("code_challenge")).toBe("chal")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("state")).toBe("st")
    expect(url.searchParams.get("scope")).toContain("user:email")
  })
})
