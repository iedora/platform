import { createSafeActionClient } from "next-safe-action"
import { z } from "zod"

import { getViewer, isAdmin, type Viewer } from "@iedora/product-tutor/auth/session"

/**
 * The shared action kernel. Every slice builds its server actions on top of
 * these clients, so validation, error shaping, and auth are consistent.
 */
export const actionClient = createSafeActionClient({
  defineMetadataSchema() {
    return z.object({ actionName: z.string() })
  },
  handleServerError(e) {
    // Never leak internals to the client.
    console.error("[action error]", e.message)
    return e.message === UNAUTHORIZED
      ? UNAUTHORIZED
      : "Something went wrong. Please try again."
  },
})

export const UNAUTHORIZED = "You need to sign in to do that."

export type { Viewer }

/**
 * Auth-guarded client. Server Functions are reachable by direct POST, so every
 * mutation must verify the session itself — this does it once for all slices.
 */
export const authActionClient = actionClient.use(async ({ next }) => {
  const viewer = await getViewer()
  if (!viewer) throw new Error(UNAUTHORIZED)
  return next({ ctx: { viewer } })
})

/** Admin-guarded client for moderation actions (approving tutor changes). */
export const adminActionClient = authActionClient.use(async ({ next }) => {
  if (!(await isAdmin())) throw new Error(UNAUTHORIZED)
  return next()
})
