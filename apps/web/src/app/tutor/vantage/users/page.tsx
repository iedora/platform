import type { Metadata } from "next"

import { logView } from "@iedora/product-tutor/vantage/audit"
import { manage } from "@iedora/product-tutor/vantage/clients"

import { EmptyState, Mono, PageHeader, Panel, Pill, ServiceError, Table, Td, Th, TimeCell } from "../_components"

export const metadata: Metadata = { title: "Users" }
export const dynamic = "force-dynamic"

export default async function UsersPage() {
  await logView("vantage.users.viewed")
  let users
  try {
    ;({ users } = await manage.listUsers())
  } catch {
    return (
      <>
        <PageHeader title="Users" sub="Accounts across the platform." />
        <Panel>
          <ServiceError service="auth" />
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Users" sub={`${users.length} account${users.length === 1 ? "" : "s"} across the platform.`} />
      <Panel>
        {users.length === 0 ? (
          <EmptyState title="No users" hint="Registered accounts appear here." />
        ) : (
          <Table
            head={
              <>
                <Th>User</Th>
                <Th>Status</Th>
                <Th className="text-right">Orgs</Th>
                <Th>Created</Th>
              </>
            }
          >
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-muted/40">
                <Td>
                  <div className="font-medium">{u.name || u.email}</div>
                  <Mono>{u.email}</Mono>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.banned ? <Pill tone="bad">banned</Pill> : <Pill tone="ok">active</Pill>}
                    {u.emailVerified ? null : <Pill tone="warn">unverified</Pill>}
                    {u.mustChangePassword ? <Pill tone="info">reset pending</Pill> : null}
                  </div>
                </Td>
                <Td className="text-right tabular-nums">{u.orgCount}</Td>
                <Td>
                  <TimeCell iso={u.createdAt} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  )
}
