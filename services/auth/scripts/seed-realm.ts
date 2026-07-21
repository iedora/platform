// Provisions the shared "iedora" realm — ONE consumer user directory that every
// product (menu / tutor / house) authenticates against, so a single account gives
// SSO across all of them (shared session cookie on .iedora.com). Idempotent:
// re-running skips anything that already exists.
//
//   AUTH_URL=https://auth.iedora.com ADMIN_TOKEN=… bun run scripts/seed-realm.ts
//
// After this, point every surface's AuthNextConfig at tenant "iedora" (audience
// "iedora", cookieDomain ".iedora.com"). OAuth providers + per-service clients are
// added the same way (POST /admin/tenants/iedora/providers, POST /admin/service-clients).

const AUTH = process.env.AUTH_URL ?? "http://localhost:4000"
const ADMIN = process.env.ADMIN_TOKEN
if (!ADMIN) throw new Error("ADMIN_TOKEN is required (the auth service's admin bearer)")

const REALM = "iedora"
const ORIGINS = [
  "https://iedora.com",
  "https://menu.iedora.com",
  "https://tutor.iedora.com",
  "http://localhost:3000",
]

async function admin(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${AUTH}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (res.ok) return
  if (res.status === 409) {
    console.log(`  (already exists) POST ${path}`)
    return
  }
  throw new Error(`POST ${path} → ${res.status} ${await res.text()}`)
}

console.log(`Seeding the "${REALM}" realm at ${AUTH}`)
await admin("/admin/tenants", {
  slug: REALM,
  name: "iedora",
  tokenAudience: REALM,
  allowedOrigins: ORIGINS,
})
console.log("  ✓ tenant")
await admin(`/admin/tenants/${REALM}/providers`, { providerId: "password", kind: "password" })
console.log("  ✓ password provider")
console.log(`Done. All products now share the "${REALM}" directory.`)
