import { useState, useTransition } from 'react'

/** The discriminated result every builder action returns. */
export type ActionResult = { ok: true } | { error?: string }

/**
 * Shared "run a builder action" plumbing for the menu dialogs: a pending
 * transition + an error string, and a `run` that invokes the action inside the
 * transition and routes its `{ error }` / `{ ok }` result. Each dialog keeps its
 * own preventDefault, field validation, and success behavior (`onSuccess`); only
 * the transition + result-narrowing + error-fallback block is shared here.
 */
export function useActionResult() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(action: () => Promise<ActionResult>, opts: { fallback: string; onSuccess: () => void }) {
    setError(null)
    startTransition(async () => {
      const res = await action()
      if (res && 'error' in res) {
        setError(res.error ?? opts.fallback)
        return
      }
      opts.onSuccess()
    })
  }

  return { pending, error, setError, run }
}
