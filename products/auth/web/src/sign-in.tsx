import { isSameIedoraOrigin } from "@iedora/brand"

import { safeNext } from "./next-url.ts"
import { SignInForm } from "./sign-in-form.tsx"

// Central sign-in. `next` is where the user was headed before hitting a gate; it
// is validated (safeNext) before use and preserved on the sign-up link so the
// round-trip survives switching between the two forms.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const keep = next && isSameIedoraOrigin(next) ? `?next=${encodeURIComponent(next)}` : ""
  return <SignInForm next={safeNext(next)} signUpHref={`/sign-up${keep}`} />
}
