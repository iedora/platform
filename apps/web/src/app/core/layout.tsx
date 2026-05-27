/**
 * Root layout for the `core` product (core.iedora.com). Intentionally
 * minimal — the actual chrome lives one layer deeper:
 *   - `(auth)/layout.tsx`  → narrow centered card for sign-in/up/out.
 *   - `admin/layout.tsx`   → wide dashboard sidebar shell.
 * Splitting prevents `max-w-md` from leaking into the admin surface.
 */
export default function CoreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
