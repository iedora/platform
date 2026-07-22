'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * A mono identifier (slug, public URL, id) with a copy button — the value
 * truncates so a long UUID/URL stays tidy in the narrow details rail, with the
 * full value one click (or hover) away. Pass `href` to make it an external link
 * as well (e.g. the public menu URL).
 */
export function CopyValue({
  value,
  display,
  href,
}: {
  value: string
  /** What to show (defaults to `value`); the full `value` is still copied. */
  display?: string
  href?: string
}) {
  const [copied, setCopied] = useState(false)
  const text = display ?? value

  function copy() {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={value}
          className="min-w-0 truncate font-mono text-[12.5px] text-foreground no-underline transition-colors hover:text-primary"
        >
          {text}
        </a>
      ) : (
        <span className="min-w-0 truncate font-mono text-[12.5px] text-foreground" title={value}>
          {text}
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy'}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
      </button>
    </span>
  )
}
