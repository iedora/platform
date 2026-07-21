'use server'

import { redirect } from 'next/navigation'
import { AuthError, type SessionView } from '@iedora/auth-sdk'
import { authClient, getAccessToken } from '@iedora/auth-sdk/next'
import { signInUrl } from '../../shared/auth-urls'
import { publicUrl } from '../../shared/url'

/**
 * Self-service account-security actions — the signed-in owner managing THEIR
 * OWN account (change password, see/kick their devices), against the shared auth
 * realm via the centralized auth client.
 */

/** A fresh Bearer access token for the current user, or bounce to sign-in. The
 *  middleware refreshes the SSO cookie on page load, so it's valid here. */
async function accessToken(): Promise<string> {
  const token = await getAccessToken()
  if (!token) redirect(signInUrl(publicUrl('/menu/dashboard').toString()))
  return token
}

export type ChangePwResult =
  | { ok: true }
  | { ok: false; error: 'wrongCurrent' | 'currentRequired' | 'failed' }

/** Change the current user's password. Omit `currentPassword` for the forced
 *  flow (just authenticated); include it for a voluntary change in settings. */
export async function changePasswordAction(input: {
  currentPassword?: string
  newPassword: string
}): Promise<ChangePwResult> {
  const token = await accessToken()
  try {
    await authClient.changePassword(token, input)
    return { ok: true }
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.status === 403) return { ok: false, error: 'wrongCurrent' }
      if (err.status === 422) return { ok: false, error: 'currentRequired' }
    }
    return { ok: false, error: 'failed' }
  }
}

/** The current user's own devices (sessions), newest first. */
export async function listMyDevicesAction(): Promise<SessionView[]> {
  return (await authClient.listSessions(await accessToken())).sessions
}

/** Sign out one of my devices (a session family), or `'*'` for all the others. */
export async function revokeMyDeviceAction(family: string): Promise<{ ok: boolean }> {
  // Resolve the token OUTSIDE the try: accessToken() may redirect() on an
  // expired session, and redirect throws a control-flow signal the bare catch
  // would otherwise swallow (leaving the user stranded with a silent {ok:false}).
  const token = await accessToken()
  try {
    if (family === '*') await authClient.revokeOtherSessions(token)
    else await authClient.revokeSession(token, family)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
