import { brandUrl } from "@iedora/brand"
import { Telescope } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: { default: "Sign in · iedora", template: "%s · iedora" },
  robots: { index: false, follow: false },
}

// Central-auth chrome — the shadcn "login-03" shape: a muted full-height canvas
// with the brand mark above a single narrow column that each page fills with its
// card. Product-neutral: this one surface signs you into menu, tutor, and the
// admin console alike.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          href={brandUrl()}
          aria-label="iedora"
          className="flex items-center justify-center gap-2 self-center font-medium no-underline"
        >
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Telescope className="size-5" strokeWidth={2} />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-foreground">iedora</span>
        </Link>
        {children}
      </div>
    </div>
  )
}
