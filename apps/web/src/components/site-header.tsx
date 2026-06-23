import { Separator } from '@iedora/ui/components/ui/separator'
import { SidebarTrigger } from '@iedora/ui/components/ui/sidebar'

/**
 * Dashboard top bar (shady-app `site-header`): the sidebar toggle + an
 * optional page title. On mobile the trigger opens the sidebar sheet.
 */
export function SiteHeader({ title }: { title?: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      {title ? (
        <>
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="text-base font-medium">{title}</h1>
        </>
      ) : null}
    </header>
  )
}
