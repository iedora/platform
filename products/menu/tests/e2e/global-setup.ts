import { execSync } from 'node:child_process'
import postgres from 'postgres'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres'
const TEST_DB = 'metamenu_test'
const TEST_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB}`

async function ensureTestDatabase() {
  const admin = postgres(ADMIN_URL, { max: 1 })
  try {
    const exists = await admin`
      SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}
    `
    if (exists.length === 0) {
      console.log(`[e2e] Creating database ${TEST_DB}…`)
      await admin.unsafe(`CREATE DATABASE "${TEST_DB}"`)
    }
  } finally {
    await admin.end({ timeout: 5 })
  }
}

async function truncateMenu() {
  const sql = postgres(TEST_URL, { max: 1 })
  try {
    // `auth.*` is gone in the post-IdaaS world. Everything menu owns lives in
    // schema `menu`. The Better Auth CLIENT tables (`user`, `session`,
    // `account`, `verification`, `rateLimit`) are also under `menu.*` —
    // they're a local cache of federated identity. CASCADE walks the FKs
    // (restaurant → menu → category → item, user → session, user → account).
    await sql`
      TRUNCATE TABLE
        "menu"."view_seen", "menu"."daily_view", "menu"."invoice",
        "menu"."item", "menu"."category", "menu"."menu",
        "menu"."restaurant", "menu"."org_plan",
        "menu"."session", "menu"."account", "menu"."verification",
        "menu"."rate_limit", "menu"."rate_limit_event", "menu"."user"
      RESTART IDENTITY CASCADE
    `
  } finally {
    await sql.end({ timeout: 5 })
  }
}

function waitForTestkit(): void {
  const handleFile = resolve(__dirname, '.testkit.json')
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (existsSync(handleFile)) {
      try {
        const data = JSON.parse(readFileSync(handleFile, 'utf8')) as {
          url: string
        }
        // Mirror onto env so test workers can read the resolved URL.
        process.env.E2E_TESTKIT_URL = data.url
        return
      } catch {
        /* file half-written; retry */
      }
    }
    // 20ms spin loop, kept tight because we expect this file in <2s.
    const start = Date.now()
    while (Date.now() - start < 20) {
      /* no-op */
    }
  }
  throw new Error('[e2e] testkit handle file never appeared')
}

export default async function globalSetup() {
  await ensureTestDatabase()
  console.log('[e2e] Running migrations against test DB…')
  execSync('bun --bun drizzle-kit migrate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_URL },
  })
  await truncateMenu()
  waitForTestkit()
  console.log(`[e2e] Test DB + testkit ready (${process.env.E2E_TESTKIT_URL}).`)
}
