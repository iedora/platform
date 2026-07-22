import Link from "next/link"

import { logView } from "./audit"
import { audit, email, manage } from "./clients"
import { Mono, PageHeader, Panel, Pill, StatCard, TimeCell } from "./components"


// Fulfilled value or null — one service being down doesn't sink the page.
async function ok<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch {
    return null
  }
}

export default async function VantageOverview() {
  await logView("vantage.overview.viewed")
  const [users, events, emails] = await Promise.all([
    ok(manage.listUsers()),
    ok(audit.query({ limit: 8 })),
    ok(email.query({ limit: 8 })),
  ])

  return (
    <>
      <PageHeader
        title="Overview"
        sub="One vantage point over the platform — accounts, activity, and mail across every product and tenant."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Users"
          value={users ? users.users.length : "—"}
          hint={users ? "accounts (auth)" : "auth unreachable"}
        />
        <StatCard
          label="Recent events"
          value={events ? events.events.length : "—"}
          hint={events ? "latest audit window" : "audit unreachable"}
        />
        <StatCard
          label="Recent emails"
          value={emails ? emails.deliveries.length : "—"}
          hint={emails ? "latest deliveries" : "email unreachable"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <RecentHeader title="Latest activity" href="/audit" />
          {events && events.events.length > 0 ? (
            <ul className="divide-y divide-border">
              {events.events.slice(0, 8).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs font-medium text-foreground">{e.action}</div>
                    <Mono>{e.source}</Mono>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Pill tone={e.outcome === "success" ? "ok" : e.outcome === "failure" ? "bad" : "muted"}>
                      {e.outcome}
                    </Pill>
                    <TimeCell iso={e.at} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {events ? "No activity yet." : "Audit service unreachable."}
            </p>
          )}
        </Panel>

        <Panel>
          <RecentHeader title="Latest emails" href="/emails" />
          {emails && emails.deliveries.length > 0 ? (
            <ul className="divide-y divide-border">
              {emails.deliveries.slice(0, 8).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{d.to}</div>
                    <div className="truncate text-xs text-muted-foreground">{d.subject}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Pill tone={d.status === "sent" ? "ok" : "bad"}>{d.status}</Pill>
                    <TimeCell iso={d.at} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {emails ? "No emails sent yet." : "Email service unreachable."}
            </p>
          )}
        </Panel>
      </div>
    </>
  )
}

function RecentHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <Link href={href} className="text-xs font-medium text-primary hover:underline">
        View all
      </Link>
    </div>
  )
}
