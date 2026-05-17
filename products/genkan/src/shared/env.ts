/**
 * Genkan's environment surface — everything the auth service needs and nothing
 * else. Menu's env.ts owns S3, Redis, etc.; genkan never touches those.
 *
 * Add a new env var by extending `serverSchema` below and `.env.example`.
 */
import { z } from 'zod'

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.url(),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),

  // Comma-separated. Every product origin that should be allowed to call
  // Genkan's auth endpoints. Adding a new product = adding its origin here.
  TRUSTED_ORIGINS: z
    .string()
    .min(1)
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  // Fallback for sign-in completions without a ?return_to parameter.
  DEFAULT_RETURN_TO: z.url(),

  DISABLE_AUTH_RATE_LIMIT: z.enum(['true', 'false']).optional(),

  // OAuth client config for first-party products. Comma-separated tuples
  // formatted `client_id|client_secret|redirect_uri_1,redirect_uri_2`.
  // Each entry pre-registers a trusted client (skipConsent=true) so users
  // signing in from menu don't see a consent screen.
  //
  // Example: "menu|s3cr3t|https://menu.iedora.com/api/auth/oauth2/callback/genkan"
  //
  // Optional in dev; required in production. The admin UI manages dynamic
  // (third-party) clients via the database; this env var is only for the
  // first-party ones we trust by construction.
  TRUSTED_CLIENTS: z.string().optional(),
})

type ServerEnv = z.infer<typeof serverSchema>

const SKIP =
  process.env.SKIP_ENV_VALIDATION === '1' ||
  process.env.SKIP_ENV_VALIDATION === 'true'

function parseEnv(): ServerEnv {
  if (SKIP) {
    return new Proxy({} as ServerEnv, {
      get(_target, key) {
        if (key === 'NODE_ENV') return 'production'
        if (key === 'TRUSTED_ORIGINS') return [] as unknown
        if (key === 'TRUSTED_CLIENTS') return undefined
        return ''
      },
    })
  }

  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('Invalid environment variables:')
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    }
    throw new Error('Environment validation failed')
  }
  return parsed.data
}

export const env: ServerEnv = parseEnv()
