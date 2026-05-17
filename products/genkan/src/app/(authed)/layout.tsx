import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MetaStrip, Wordmark } from '@iedora/design-system'
import { auth } from '@/features/auth/adapters/better-auth-instance'

/**
 * Shell for every signed-in page (profile, consent, future settings).
 * Soft check: redirects unauthenticated users to /login with a return_to.
 * Per-page DAL guards still apply for stricter requirements (admin role, etc.).
 */
export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    redirect('/login')
  }

  return (
    <div
      className="ds-root"
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <div
        style={{
          width: 'min(1100px, 100%)',
          margin: '0 auto',
          padding: '36px 56px 0',
        }}
      >
        <MetaStrip
          left={
            <>
              <span>MMXXVI</span>
              <span>Genkan · Identity</span>
            </>
          }
          right={
            <>
              <Link href="/profile">Profile</Link>
              <span aria-hidden="true">·</span>
              <Link href="/api/auth/sign-out">Sign out</Link>
            </>
          }
        />
      </div>

      <main
        style={{
          flex: 1,
          padding: '64px 56px 96px',
          width: 'min(1100px, 100%)',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 48,
        }}
      >
        <Link href="/profile" aria-label="Genkan" style={{ textDecoration: 'none' }}>
          <Wordmark variant="inline" className="ds-wordmark--reveal" />
        </Link>
        {children}
      </main>
    </div>
  )
}
