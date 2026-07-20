import type { Metadata } from "next"

import { logView } from "@iedora/product-tutor/vantage/audit"
import { audit } from "@iedora/product-tutor/vantage/clients"

import { EmptyState, Mono, PageHeader, Panel, Pill, ServiceError, Table, Td, Th, TimeCell } from "../_components"

export const metadata: Metadata = { title: "Audit log" }
export const dynamic = "force-dynamic"

function outcomeTone(o: string): "ok" | "bad" | "muted" {
  if (o === "success") return "ok"
  if (o === "failure") return "bad"
  return "muted"
}

export default async function AuditPage() {
  await logView("vantage.audit.viewed")
  let events
  try {
    ;({ events } = await audit.query({ limit: 100 }))
  } catch {
    return (
      <>
        <PageHeader title="Audit log" sub="Every recorded action across the platform." />
        <Panel>
          <ServiceError service="audit" />
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Audit log" sub="Every recorded action across the platform, newest first." />
      <Panel>
        {events.length === 0 ? (
          <EmptyState title="No audit events" hint="Actions emitted by any service land here." />
        ) : (
          <Table
            head={
              <>
                <Th>When</Th>
                <Th>Action</Th>
                <Th>Outcome</Th>
                <Th>Actor</Th>
                <Th>Target</Th>
                <Th>Source</Th>
              </>
            }
          >
            {events.map((e) => (
              <tr key={e.id} className="hover:bg-muted/40">
                <Td>
                  <TimeCell iso={e.at} />
                </Td>
                <Td className="font-mono text-xs font-medium">{e.action}</Td>
                <Td>
                  <Pill tone={outcomeTone(e.outcome)}>{e.outcome}</Pill>
                </Td>
                <Td>
                  <div className="text-foreground">{e.actorType}</div>
                  {e.actorId ? <Mono>{e.actorId}</Mono> : null}
                </Td>
                <Td>
                  {e.targetType ? (
                    <>
                      <div className="text-muted-foreground">{e.targetType}</div>
                      {e.targetId ? <Mono>{e.targetId}</Mono> : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Td>
                <Td>
                  <Mono>{e.source}</Mono>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  )
}
