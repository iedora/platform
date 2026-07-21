import { Hono } from "hono"

import { resolveSession } from "../../data/session"
import type { TutorDeps } from "../../deps"
import type { TutorEnv } from "../../middleware"

// The viewer's profile. Identity + email come from the verified Bearer principal;
// the service owns the tutor/student membership the web can't derive, and bootstraps
// a student on first sight.
export function sessionRoutes(deps: TutorDeps) {
  return new Hono<TutorEnv>().get("/me", async (c) => {
    const user = c.get("user")
    return c.json(await resolveSession(deps.db.db, deps.cfg, user.userId, user.email))
  })
}
