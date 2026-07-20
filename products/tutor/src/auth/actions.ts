"use server"

import type { AuthResult } from "@iedora/auth-sdk-nextjs"

import { authNext } from "./index"

export async function loginAction(input: { email: string; password: string }): Promise<AuthResult> {
  return authNext.actions.login(input)
}
export async function registerAction(input: {
  email: string
  password: string
  name?: string
}): Promise<AuthResult> {
  return authNext.actions.register(input)
}
export async function logoutAction(): Promise<void> {
  return authNext.actions.logout()
}
export async function completeOAuthAction(
  accessToken: string,
  refreshToken: string,
): Promise<AuthResult> {
  return authNext.actions.completeOAuth(accessToken, refreshToken)
}
