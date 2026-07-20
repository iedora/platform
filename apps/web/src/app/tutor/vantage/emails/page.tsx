import type { Metadata } from "next"

import { logView } from "@iedora/product-tutor/vantage/audit"
import { email } from "@iedora/product-tutor/vantage/clients"

import { EmptyState, Mono, PageHeader, Panel, Pill, ServiceError, Table, Td, Th, TimeCell } from "../_components"

export const metadata: Metadata = { title: "Emails" }
export const dynamic = "force-dynamic"

export default async function EmailsPage() {
  await logView("vantage.emails.viewed")
  let deliveries
  try {
    ;({ deliveries } = await email.query({ limit: 100 }))
  } catch {
    return (
      <>
        <PageHeader title="Emails" sub="Every transactional email the platform has sent." />
        <Panel>
          <ServiceError service="email" />
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Emails" sub="Every transactional email the platform has sent, newest first." />
      <Panel>
        {deliveries.length === 0 ? (
          <EmptyState title="No emails sent yet" hint="Delivered emails show up here as soon as a service sends one." />
        ) : (
          <Table
            head={
              <>
                <Th>Sent</Th>
                <Th>To</Th>
                <Th>Subject</Th>
                <Th>Status</Th>
                <Th>From</Th>
              </>
            }
          >
            {deliveries.map((d) => (
              <tr key={d.id} className="hover:bg-muted/40">
                <Td>
                  <TimeCell iso={d.at} />
                </Td>
                <Td className="font-medium">{d.to}</Td>
                <Td className="max-w-xs truncate text-muted-foreground" title={d.subject}>
                  {d.subject}
                </Td>
                <Td>{d.status === "sent" ? <Pill tone="ok">sent</Pill> : <Pill tone="bad">{d.status}</Pill>}</Td>
                <Td>
                  <Mono>{d.source}</Mono>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  )
}
