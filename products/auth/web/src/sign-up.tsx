import { isSameIedoraOrigin } from "@iedora/brand"

import { safeNext } from "./next-url.ts"
import { SignUpForm } from "./sign-up-form.tsx"

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const keep = next && isSameIedoraOrigin(next) ? `?next=${encodeURIComponent(next)}` : ""
  return <SignUpForm next={safeNext(next)} signInHref={`/sign-in${keep}`} />
}
