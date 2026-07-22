// Provisions the shared "iedora" realm — ONE consumer user directory that every
// product (menu / tutor / house / vantage) authenticates against, so a single
// account gives SSO across all of them (shared session cookie on .iedora.com).
// Idempotent: the admin routes upsert, so re-running reconciles config (origins,
// provider, client secrets) without wiping users.
//
//   AUTH_URL=https://auth.iedora.com ADMIN_TOKEN=… node scripts/seed-realm.ts
//
// Optionally register the backend service clients (M2M client-credentials) by
// passing their ids + secrets as JSON — pipe them from SOPS, never hardcode:
//   SEED_SERVICE_CLIENTS='[{"clientId":"vantage","secret":"…","name":"Vantage"}]'
//
// After this, point every surface's AuthNextConfig at tenant "iedora" (audience
// "iedora", cookieDomain ".iedora.com").

const AUTH = process.env.AUTH_URL ?? "http://localhost:4000"
const ADMIN = process.env.ADMIN_TOKEN
if (!ADMIN) throw new Error("ADMIN_TOKEN is required (the auth service's admin bearer)")

const REALM = "iedora"
const ORIGINS = [
  "https://iedora.com",
  "https://menu.iedora.com",
  "https://tutor.iedora.com",
  "https://vantage.iedora.com",
  "http://localhost:3000",
]

async function admin(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${AUTH}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`)
}

interface ServiceClient {
  clientId: string
  secret: string
  name: string
}

function serviceClients(): ServiceClient[] {
  const raw = process.env.SEED_SERVICE_CLIENTS
  if (!raw) return []
  const parsed = JSON.parse(raw) as ServiceClient[]
  for (const c of parsed) {
    if (!c.clientId || !c.secret || !c.name) {
      throw new Error(`SEED_SERVICE_CLIENTS entry needs clientId, secret, name: ${JSON.stringify(c)}`)
    }
  }
  return parsed
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

for (const client of serviceClients()) {
  await admin("/admin/service-clients", {
    clientId: client.clientId,
    secret: client.secret,
    name: client.name,
  })
  console.log(`  ✓ service client "${client.clientId}"`)
}

console.log(`Done. All products now share the "${REALM}" directory.`)
