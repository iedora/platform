import { loginAction, logoutAction, registerAction } from "@iedora/product-tutor/auth/actions"

// Same surface the sign-in page + sign-out button already use, now backed by the
// iedora auth service via server actions (which set the httpOnly cookies).
export const signIn = {
  email: (input: { email: string; password: string }) => loginAction(input),
}
export const signUp = {
  email: (input: { email: string; password: string; name?: string }) => registerAction(input),
}
export const signOut = () => logoutAction()
