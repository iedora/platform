import { Fragment } from 'react'
import Link from 'next/link'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@iedora/ui/components/ui/breadcrumb'

export type Crumb = { label: string; href?: string }

/**
 * Renders a breadcrumb trail (the `@breadcrumb` slot's shared view). The leaf is
 * a plain page; earlier crumbs with an href are links. Empty trail renders
 * nothing so the header just shows the sidebar toggle.
 */
export function BreadcrumbTrail({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((c, i) => {
          const last = i === items.length - 1
          return (
            <Fragment key={`${c.label}-${i}`}>
              <BreadcrumbItem>
                {last || !c.href ? (
                  <BreadcrumbPage>{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={c.href} />}>{c.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {last ? null : <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
