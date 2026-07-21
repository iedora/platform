"use client"

import type { ReactNode } from "react"

import { cn } from "@iedora/ui/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
} as const

export type AppDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Heading shown in the dialog header. */
  title: ReactNode
  /** Optional supporting line under the title. */
  description?: ReactNode
  /** Body content. Optional — a confirm dialog can be header + footer only. */
  children?: ReactNode
  /** Action row, right-aligned (e.g. Cancel + Save). Omit for a body-only dialog. */
  footer?: ReactNode
  /** Max width preset. Defaults to `md`. */
  size?: keyof typeof SIZES
  className?: string
  "data-test-id"?: string
}

/**
 * The one dialog shell every feature uses, so modals look and behave the same
 * across the product: capped to the viewport with internal scroll (mobile-safe),
 * a consistent header (title + optional description), and a right-aligned footer
 * via shadcn's DialogFooter. Features supply only the body and action buttons.
 */
export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  "data-test-id": testId,
}: AppDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto", SIZES[size], className)}
        // No description ⇒ opt out of the auto aria-describedby (avoids the
        // Base UI "missing Description" warning).
        {...(description ? {} : { "aria-describedby": undefined })}
        data-test-id={testId}
      >
        <DialogHeader>
          <DialogTitle className="break-words">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {/* Actions stay on one right-aligned row (no stacking on mobile). */}
        {footer ? <DialogFooter className="flex-row justify-end">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}
