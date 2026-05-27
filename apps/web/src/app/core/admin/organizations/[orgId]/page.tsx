import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import {
  Card,
  CardTitle,
  CardDesc,
  EmptyState,
  Table,
  Badge,
} from '@iedora/design-system'
import { requireIedoraAdmin } from '@iedora/product-core'
import {
  drizzleAdminOrgsGateway,
  getFullOrg,
} from '@iedora/product-core/features/admin-orgs'
import { AdminPage } from '@iedora/product-core/shared/ui/admin-page'
import { MemberRowActions } from '@iedora/product-core/features/admin-orgs/ui/member-row-actions'
import { CancelInvitationButton } from '@iedora/product-core/features/admin-orgs/ui/cancel-invitation-button'

type Params = Promise<{ orgId: string }>

export default async function OrganizationDetailPage({
  params,
}: {
  params: Params
}) {
  await requireIedoraAdmin()
  const t = await getTranslations('Core.admin.orgs.detail')
  const { orgId } = await params

  const gateway = drizzleAdminOrgsGateway()
  const full = await getFullOrg(gateway, { orgId })
  if (!full) notFound()

  const { org, members, invitations } = full
  const plan =
    typeof org.metadata?.plan === 'string' ? (org.metadata.plan as string) : null

  return (
    <AdminPage
      crumbs={[
        { label: t('crumbAdmin'), href: '/core/admin', testId: 'admin' },
        {
          label: t('crumbOrgs'),
          href: '/core/admin/organizations',
          testId: 'orgs',
        },
      ]}
      title={org.name}
      eyebrow={org.slug ?? undefined}
      description={t('description', { count: org.memberCount })}
      actions={plan ? <Badge>{plan}</Badge> : null}
      data-test-id="admin-org-detail"
    >
      <section>
        <header className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="ds-section-header__title">{t('membersTitle')}</h2>
          <span className="text-xs text-[var(--ink-70)]">
            {t('membersCount', { count: members.length })}
          </span>
        </header>
        {members.length === 0 ? (
          <EmptyState label={t('membersEmpty')} />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table data-test-id="admin-org-members-table">
                <thead>
                  <tr>
                    <th>{t('memberColumnUser')}</th>
                    <th>{t('memberColumnJoined')}</th>
                    <th>{t('memberColumnRole')}</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr
                      key={m.id}
                      data-test-id={`admin-org-member-row-${m.id}`}
                    >
                      <td>
                        <Link
                          href={`/core/admin/users/${m.userId}`}
                          className="block hover:underline"
                          data-test-id={`admin-org-member-link-${m.id}`}
                        >
                          <div className="font-medium">{m.userName || '—'}</div>
                          <div className="text-xs text-[var(--ink-70)]">
                            {m.userEmail}
                          </div>
                        </Link>
                      </td>
                      <td className="text-xs whitespace-nowrap">
                        {m.createdAt.toLocaleDateString()}
                      </td>
                      <td>
                        <MemberRowActions
                          organizationId={orgId}
                          memberId={m.id}
                          memberUserId={m.userId}
                          memberEmail={m.userEmail}
                          currentRole={m.role}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        )}
      </section>

      <section>
        <header className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="ds-section-header__title">{t('invitationsTitle')}</h2>
          {invitations.length > 0 ? (
            <span className="text-xs text-[var(--ink-70)]">
              {t('invitationsCount', { count: invitations.length })}
            </span>
          ) : null}
        </header>
        {invitations.length === 0 ? (
          <Card>
            <CardTitle as="h3">{t('invitationsEmptyTitle')}</CardTitle>
            <CardDesc>{t('invitationsEmpty')}</CardDesc>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table data-test-id="admin-org-invitations-table">
                <thead>
                  <tr>
                    <th>{t('inviteColumnEmail')}</th>
                    <th>{t('inviteColumnRole')}</th>
                    <th>{t('inviteColumnInviter')}</th>
                    <th>{t('inviteColumnExpires')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((i) => (
                    <tr
                      key={i.id}
                      data-test-id={`admin-org-invitation-row-${i.id}`}
                    >
                      <td className="font-medium">{i.email}</td>
                      <td>{i.role ?? '—'}</td>
                      <td className="text-xs text-[var(--ink-70)]">
                        {i.inviterEmail ?? i.inviterId}
                      </td>
                      <td className="text-xs whitespace-nowrap">
                        {i.expiresAt.toLocaleString()}
                      </td>
                      <td className="text-right">
                        <CancelInvitationButton
                          organizationId={orgId}
                          invitationId={i.id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        )}
      </section>
    </AdminPage>
  )
}
