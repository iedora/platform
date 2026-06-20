import { Phone } from 'lucide-react'

const SUPPORT_PHONE = '+351 917 140 356'

/**
 * Support line (Pencil "Support Line v2") — a rounded muted pill, centered
 * and stacked: the phone icon sits inline with the help label on the first
 * line, the number on the second. Each line stays whole at any width — never
 * the icon floating beside a wrapped block. Shared by the auth + onboarding
 * chrome; `label` comes from the caller's i18n namespace.
 */
export function SupportLine({
  label,
  className = '',
  testId,
}: {
  label: string
  className?: string
  testId?: string
}) {
  return (
    <a
      href={`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`}
      className={`flex flex-col items-center justify-center gap-1 rounded-[28px] bg-muted px-5 py-3.5 text-center no-underline ${className}`}
      data-test-id={testId}
    >
      <span className="flex items-center gap-2 text-[14px] text-muted-foreground">
        <Phone size={15} strokeWidth={2} aria-hidden="true" />
        {label}
      </span>
      <span className="text-[15px] font-semibold tracking-[0.01em] text-primary">{SUPPORT_PHONE}</span>
    </a>
  )
}
