"use server"

import { completeOAuth, login, logout, register, type AuthResult } from "@iedora/auth-sdk/next"

// Thin product-facing wrappers over the ONE centralized auth integration. The
// SSO cookie + JWKS + shared iedora realm all live in @iedora/auth-sdk/next.
export async function loginAction(input: { email: string; password: string }): Promise<AuthResult> {
  return login(input)
}
export async function registerAction(input: {
  email: string
  password: string
  name?: string
}): Promise<AuthResult> {
  return register(input)
}
export async function logoutAction(): Promise<void> {
  return logout()
}
export async function completeOAuthAction(
  accessToken: string,
  refreshToken: string,
): Promise<AuthResult> {
  return completeOAuth(accessToken, refreshToken)
}
