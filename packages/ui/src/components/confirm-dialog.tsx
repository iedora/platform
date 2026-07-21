"use client"

import type { ReactNode } from "react"

import { AppDialog } from "./app-dialog"
import { Button } from "./ui/button"

export type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Short question, e.g. "Delete QR code?". */
  title: ReactNode
  /** The consequence, e.g. "This cannot be undone." Shown as the body. */
  description?: ReactNode
  confirmLabel: ReactNode
  cancelLabel: ReactNode
  onConfirm: () => void
  /** Spinner on the confirm button + cancel disabled while the action runs. */
  loading?: boolean
  /** Red confirm button for destructive actions (delete, revoke). */
  destructive?: boolean
  /** Extra body content above the footer, if a single line isn't enough. */
  children?: ReactNode
  "data-test-id"?: string
}

/**
 * Reusable confirmation dialog for destructive or irreversible actions, built on
 * the shared `AppDialog`. Replaces native `window.confirm()` so every "are you
 * sure?" across the product looks and behaves the same. The caller owns the
 * action + its loading state; this only renders the prompt and the two buttons.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  loading = false,
  destructive = false,
  children,
  "data-test-id": testId,
}: ConfirmDialogProps) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      data-test-id={testId}
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            data-test-id={testId ? `${testId}-cancel` : undefined}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
            loading={loading}
            data-test-id={testId ? `${testId}-confirm` : undefined}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </AppDialog>
  )
}
