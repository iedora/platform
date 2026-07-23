import { Badge } from "@iedora/ui/components/ui/badge"
import { Card } from "@iedora/ui/components/ui/card"
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@iedora/ui/components/ui/table"
import { cn } from "@iedora/ui/lib/utils"
import type { ReactNode } from "react"

/* --------------------------------- layout -------------------------------- */

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      {sub ? <p className="mt-1 text-sm text-muted-foreground">{sub}</p> : null}
    </header>
  )
}

// A flush shadcn Card (no default vertical padding/gap) — the panel wraps tables
// and empty states that own their own spacing.
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cn("gap-0 overflow-hidden py-0", className)}>{children}</Card>
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="gap-0 p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  )
}

/* --------------------------------- table --------------------------------- */

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <UITable>
        <TableHeader>
          <TableRow className="text-xs uppercase tracking-wider text-muted-foreground">{head}</TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </UITable>
    </div>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <TableHead className={cn("font-medium", className)}>{children}</TableHead>
}

export function Td({
  children,
  className,
  title,
}: {
  children?: ReactNode
  className?: string
  title?: string
}) {
  return (
    <TableCell className={cn("py-3 align-middle text-foreground", className)} title={title}>
      {children}
    </TableCell>
  )
}

/* ------------------------------- primitives ------------------------------ */

type Tone = "ok" | "bad" | "warn" | "muted" | "info"

const TONE: Record<Tone, string> = {
  ok: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  bad: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  info: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  muted: "bg-muted text-muted-foreground",
}

// Semantic status chip on the shadcn Badge — the tone map supplies the color,
// the base gives shape/typography.
export function Pill({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <Badge variant="secondary" className={cn("gap-1 rounded-full border-transparent font-medium", TONE[tone])}>
      {children}
    </Badge>
  )
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs text-muted-foreground", className)}>{children}</span>
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-16 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Rendered when a service is unreachable / unconfigured, so a page degrades
 *  instead of throwing (env not wired, service down, etc.). */
export function ServiceError({ service }: { service: string }) {
  return (
    <EmptyState
      title={`Couldn't reach ${service}`}
      hint={`Check that the ${service} service is up and its base URL + a platform service token are configured for Vantage.`}
    />
  )
}

/* ------------------------------- formatting ------------------------------ */

const REL = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1_000],
]

export function fmtTime(iso: string): { abs: string; rel: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { abs: iso, rel: "" }
  const abs = d.toISOString().slice(0, 19).replace("T", " ")
  const diff = d.getTime() - Date.now()
  let rel = ""
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === "second") {
      rel = REL.format(Math.round(diff / ms), unit)
      break
    }
  }
  return { abs, rel }
}

export function TimeCell({ iso }: { iso: string }) {
  const { abs, rel } = fmtTime(iso)
  return (
    <div className="whitespace-nowrap">
      <div className="tabular-nums text-foreground">{abs}</div>
      {rel ? <div className="text-xs text-muted-foreground">{rel}</div> : null}
    </div>
  )
}
