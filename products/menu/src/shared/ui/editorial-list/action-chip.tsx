import Link from 'next/link'
import type { EditorialAction } from './types'

export function ActionChip({ action }: { action: EditorialAction }) {
  return (
    <Link
      href={action.href}
      aria-label={action.ariaLabel ?? action.label}
      className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-[12px] font-medium text-foreground no-underline transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {action.label}
    </Link>
  )
}
