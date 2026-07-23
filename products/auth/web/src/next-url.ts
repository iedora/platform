import { brandUrl, isSameIedoraOrigin } from "@iedora/brand"

/**
 * Sanitise the `next` param. After sign-in we send the user back to where they
 * came from — but ONLY to an iedora origin, so a crafted `?next=https://evil`
 * can't turn our sign-in into an open redirect. Anything else falls back to the
 * brand home.
 */
export function safeNext(next: string | undefined | null): string {
  return next && isSameIedoraOrigin(next) ? next : brandUrl()
}
