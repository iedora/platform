'use client'

import { useEffect, useState } from 'react'

/**
 * Run `fn(value)` after the user stops changing `value` for `delay` ms and
 * return its latest result (null while the input is empty). `fn` must be a
 * stable reference — a module-level server action. Shared by the availability
 * checks (slug preview, transfer eligibility) so the debounce lives in one place.
 */
export function useDebouncedAction<T>(
  value: string,
  fn: (v: string) => Promise<T>,
  delay = 400,
): T | null {
  const [result, setResult] = useState<T | null>(null)
  useEffect(() => {
    const v = value.trim()
    if (!v) {
      setResult(null)
      return
    }
    const id = setTimeout(() => void fn(v).then(setResult), delay)
    return () => clearTimeout(id)
  }, [value, fn, delay])
  return result
}
