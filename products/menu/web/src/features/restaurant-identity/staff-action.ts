import 'server-only'
import { revalidatePath } from 'next/cache'
import { requireStaff } from '../auth'

/**
 * Runs a staff-gated mutation: gate → run → revalidate → `{ ok }`. Collapses the
 * repeated `requireStaff()` + try/catch + `revalidatePath` boilerplate that every
 * admin write action had. A plain helper (NOT a server action — it takes a
 * function, which isn't serializable), imported by the 'use server' actions.
 */
export async function staffMutation(
  fn: () => Promise<unknown>,
  revalidate?: string,
): Promise<{ ok: boolean }> {
  await requireStaff()
  try {
    await fn()
    if (revalidate) revalidatePath(revalidate)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
