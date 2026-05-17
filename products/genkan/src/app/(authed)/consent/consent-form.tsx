'use client'

import { useState } from 'react'
import { Button } from '@iedora/design-system'
import { authClient } from '@/features/auth/client'

/**
 * Submit the user's accept/deny decision to Better Auth's oauth2.consent
 * endpoint. On success, Better Auth continues the authorization flow and
 * redirects the browser back to the client's callback URL with a code.
 */
export function ConsentForm({ scope }: { scope: string }) {
  const [pending, setPending] = useState<'accept' | 'deny' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(accept: boolean) {
    setPending(accept ? 'accept' : 'deny')
    setError(null)
    try {
      // Better Auth's oauth2.consent endpoint completes the auth flow and
      // returns the next redirect URL — full-page navigation so cookies on
      // the destination's origin attach naturally.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = authClient as any
      const { data, error: consentError } = await client.oauth2.consent({
        accept,
        scope: accept ? scope : undefined,
      })
      if (consentError) {
        setError(consentError.message ?? 'Could not record the decision.')
        setPending(null)
        return
      }
      const next = (data?.redirectUri as string | undefined) ?? '/profile'
      window.location.assign(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setPending(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {error ? (
        <p
          role="alert"
          style={{
            margin: 0,
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.1em',
            color: 'var(--cinnabar)',
          }}
        >
          {error}
        </p>
      ) : null}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <Button
          variant="ghost"
          onClick={() => submit(false)}
          disabled={pending !== null}
        >
          {pending === 'deny' ? 'Sending…' : 'Deny'}
        </Button>
        <Button
          variant="accent"
          arrow
          onClick={() => submit(true)}
          disabled={pending !== null}
        >
          {pending === 'accept' ? 'Entering…' : 'Allow'}
        </Button>
      </div>
    </div>
  )
}
