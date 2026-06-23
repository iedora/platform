import Link from 'next/link'
import { ActionChip } from './action-chip'
import { formatDelta } from './format'
import type { EditorialRow as Row } from './types'

/**
 * One row in the editorial list. The title is a `<Link>`; the chips and any
 * other interactive children are siblings of that link, never nested inside
 * it (nested anchors are invalid and break keyboard nav). The row's hover
 * effect lives on the outer `<div>` so it covers chip hover too.
 */
export function EditorialRow({ row }: { row: Row }) {
  const trailing = row.trailing
  return (
    <div
      className="group block py-[18px] no-underline text-inherit border-b border-border transition-[background] duration-[180ms] ease-out hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:[outline-offset:-2px]"
      data-testid="editorial-row"
    >
      <div className="flex items-baseline gap-3">
        {row.index && (
          <span
            aria-hidden="true"
            className="text-[12.5px] text-muted-foreground tabular-nums"
          >
            {row.index}
          </span>
        )}
        <Link
          href={row.href}
          className="block min-w-0 no-underline text-foreground"
        >
          <div className="font-[family-name:var(--display)] text-[17px] font-semibold leading-tight tracking-tight">
            {row.title}
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[12.5px] text-muted-foreground">
            {row.subtitle}
          </div>
        </Link>
        <span
          aria-hidden="true"
          className="flex-1 h-0 mx-[14px] -translate-y-1.5 border-b border-dotted border-border group-hover:border-muted-foreground"
        />
        {trailing ? (
          <div className="text-right">
            <div className="text-[15px] font-medium tabular-nums">
              {trailing.value === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <>
                  {trailing.value.toLocaleString()}
                  {trailing.deltaPct !== undefined && (
                    <DeltaTag deltaPct={trailing.deltaPct} />
                  )}
                </>
              )}
            </div>
            {trailing.comparison && (
              <div className="text-[12px] text-muted-foreground mt-1">
                {trailing.comparison}
              </div>
            )}
          </div>
        ) : null}
      </div>
      {(row.metadata || (row.actions && row.actions.length > 0)) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-[18px] text-[12.5px] text-foreground">
          {row.metadata && (
            <span className="text-muted-foreground">
              {row.metadata}
            </span>
          )}
          {((row.actions && row.actions.length > 0) || row.extraActions) && (
            <span className="inline-flex flex-wrap items-center gap-2 ml-auto">
              {row.actions?.map((a) => (
                <ActionChip key={a.key} action={a} />
              ))}
              {row.extraActions}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function DeltaTag({ deltaPct }: { deltaPct: number }) {
  const { marker, value } = formatDelta(deltaPct)
  const positive = deltaPct > 0
  const negative = deltaPct < 0
  return (
    <span
      className={
        'ml-2 text-[12px] tabular-nums ' +
        (positive
          ? 'text-[#3d5a3a]'
          : negative
            ? 'text-[#9c4f3f]'
            : 'text-muted-foreground')
      }
    >
      {marker}
      {value}
    </span>
  )
}
