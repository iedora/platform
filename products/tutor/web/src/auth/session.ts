import { redirect } from "next/navigation"
import { cache } from "react"

import { authNext } from "@iedora/auth-sdk/next"
import { brandUrl } from "@iedora/brand"

import { getSession } from "../api/session"

export type Viewer = {
  userId: string
  name: string
  email: string
  role: "student" | "tutor"
  studentId: string | null
  tutorId: string | null
  /** The zone every time in the UI is rendered in. Never assume it's the tutor's. */
  timezone: string
  /** "auto" means we detected it and may keep it in sync; "manual" is hands-off. */
  timezoneSource: "auto" | "manual"
  /** Whether the viewer moderates the platform (ADMIN_EMAILS or an `admin` row). */
  isAdmin: boolean
  /** Student only (null for tutors) — the learner-XP display bits. */
  learnerLevel: number | null
  learnerXp: number | null
}

/**
 * The signed-in viewer, or null. The access-token cookie is verified locally
 * against the auth service's JWKS (name/email come from the claims); middleware
 * refreshes an expired token before the request reaches here. The tutor/student
 * membership + admin + learner bits come from the tutor service (`/api/me`, which
 * also bootstraps a student on first sight). Wrapped in `cache()` so the verify +
 * the one service call run once per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const claims = await authNext.getClaims()
  if (!claims) return null

  const session = await getSession()
  return {
    userId: claims.sub,
    name: claims.name ?? "",
    email: claims.email ?? "",
    ...session,
  }
})

/** Use in Server Components that require a session. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) redirect(`${brandUrl()}/sign-in`)
  return viewer
}

/** Whether the signed-in viewer moderates the platform. Cached per request. */
export const isAdmin = cache(async (): Promise<boolean> => {
  const viewer = await getViewer()
  return viewer?.isAdmin ?? false
})

/** Use in admin-only Server Components. Redirects non-admins away. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer()
  if (!viewer.isAdmin) redirect("/account")
  return viewer
}
