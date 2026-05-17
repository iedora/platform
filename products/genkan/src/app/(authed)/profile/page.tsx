import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge, EmptyState, Separator } from '@iedora/design-system'
import { auth } from '@/features/auth/adapters/better-auth-instance'
import { listUserGrants, listProfileOrganizations } from '@/features/profile'
import { revokeGrant } from './actions'

export const metadata = { title: 'Profile' }

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login')

  const userId = session.user.id
  const [grants, organizations] = await Promise.all([
    listUserGrants(userId),
    listProfileOrganizations(userId),
  ])

  return (
    <div style={{ display: 'grid', gap: 64, maxWidth: 760 }}>
      <header style={{ display: 'grid', gap: 8 }}>
        <span className="eyebrow">/ 01 ACCOUNT</span>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--serif)',
            fontWeight: 300,
            fontSize: 'clamp(40px, 6vw, 64px)',
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
          }}
        >
          {session.user.name}
          <span style={{ color: 'var(--cinnabar)' }}>.</span>
        </h1>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 17,
            color: 'var(--ink-70)',
          }}
        >
          {session.user.email}
        </p>
      </header>

      <Separator />

      <section style={{ display: 'grid', gap: 24 }}>
        <span className="eyebrow">/ 02 PRODUCTS</span>
        {grants.length === 0 ? (
          <EmptyState
            label="No products yet"
            note="When you sign in to a work for the first time, it lands here."
          />
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 24,
            }}
          >
            {grants.map((g) => (
              <li
                key={g.consentId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'baseline',
                  gap: 18,
                  paddingBottom: 18,
                  borderBottom: '1px solid var(--ink-14)',
                }}
              >
                <div style={{ display: 'grid', gap: 4 }}>
                  <div
                    style={{
                      fontFamily: 'var(--serif)',
                      fontSize: 21,
                      letterSpacing: '-0.015em',
                    }}
                  >
                    {g.clientName}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10.5,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--ink-55)',
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    {g.scopes.map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </div>
                </div>
                <form action={revokeGrant}>
                  <input type="hidden" name="consentId" value={g.consentId} />
                  <button
                    type="submit"
                    style={{
                      background: 'transparent',
                      border: 0,
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)',
                      fontSize: 10.5,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--cinnabar)',
                    }}
                  >
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section style={{ display: 'grid', gap: 24 }}>
        <span className="eyebrow">/ 03 ORGANIZATIONS</span>
        {organizations.length === 0 ? (
          <EmptyState
            label="No organizations yet"
            note="Create one when you onboard a restaurant in Menu."
          />
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 14,
            }}
          >
            {organizations.map((o) => (
              <li
                key={o.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'baseline',
                  gap: 18,
                }}
              >
                <div style={{ display: 'grid', gap: 2 }}>
                  <span
                    style={{
                      fontFamily: 'var(--serif)',
                      fontSize: 19,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {o.name}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10.5,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--ink-55)',
                    }}
                  >
                    /{o.slug}
                  </span>
                </div>
                <Badge>{o.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {session.user.role === 'admin' ? (
        <>
          <Separator />
          <section style={{ display: 'grid', gap: 12 }}>
            <span className="eyebrow">/ 04 ADMIN</span>
            <p
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 17,
                color: 'var(--ink-70)',
                maxWidth: 56 + 'ch',
              }}
            >
              You have platform-admin access. Manage users, organizations, and
              registered applications.
            </p>
            <Link
              href="/admin"
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--cinnabar)',
                textDecoration: 'none',
              }}
            >
              Open admin →
            </Link>
          </section>
        </>
      ) : null}
    </div>
  )
}
