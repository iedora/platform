'use client'

import { useEffect } from 'react'

/**
 * Last-resort error boundary (App Router `global-error`): only fires when the
 * root layout itself throws, so it REPLACES the layout and must render its own
 * <html>/<body>. CSS imports are ignored here, so styling is inline only and
 * the copy stays minimal. Rare in practice, but it guarantees we never show the
 * browser's default crash screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          color: '#1a1a1a',
          background: '#fff',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#6b7280', margin: 0 }}>
            Error
          </p>
          <h1 style={{ marginTop: '0.75rem', fontSize: '1.5rem', fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Please reload the page. If it keeps happening, try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#fff',
              background: '#c2410c',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
