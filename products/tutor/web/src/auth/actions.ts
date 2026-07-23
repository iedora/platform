"use server"

import { logout } from "@iedora/auth-sdk/next"

// Product-facing sign-out over the ONE centralized auth integration. Credential
// exchange (sign-in / sign-up / OAuth) now lives on the central auth surface
// (iedora.com); this package only clears the SSO cookies via logout().
export async function logoutAction(): Promise<void> {
  return logout()
}
