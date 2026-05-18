import Link from 'next/link'
import { MetaStrip, Wordmark } from '@iedora/design-system'

/**
 * Shell for the public auth pages (/login, /signup). Matches the chrome
 * shape used by /admin and /(authed) so the user experiences one product,
 * not three different sites — see `products/genkan/CLAUDE.md` § Design
 * language.
 *
 * Layout: MetaStrip · genkan wordmark · form content. The form's own
 * heading lives inside the page (LoginForm / SignupForm), not here.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className="ds-root ds-root--washed"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className="ds-shell ds-shell-meta"
        style={{
          paddingTop: 'clamp(var(--s-4), 5vw, var(--s-6))',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <MetaStrip
          left={
            <>
              <span>MMXXVI</span>
              <span>Genkan · Entry</span>
            </>
          }
          right={<Link href="/">Home</Link>}
        />
      </div>

      <header
        className="ds-shell"
        style={{
          paddingTop: 'clamp(var(--s-4), 4vw, var(--s-6))',
        }}
      >
        <Link
          href="/"
          aria-label="Genkan — home"
          style={{ textDecoration: 'none', display: 'inline-flex' }}
        >
          <Wordmark
            word="genkan"
            variant="inline"
            className="ds-wordmark--reveal"
          />
        </Link>
      </header>

      <main
        className="ds-shell"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingBlock: 'clamp(var(--s-7), 8vw, var(--s-10))',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ width: '100%', maxWidth: 560 }}>{children}</div>
      </main>
    </div>
  )
}
