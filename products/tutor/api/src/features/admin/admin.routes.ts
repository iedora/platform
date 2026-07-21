import { rejectChangeInput } from "#contracts/admin"
import { validate } from "@iedora/service-kit"
import { Hono } from "hono"

import { adminByEmail, listPendingChanges } from "../../data/admin.ts"
import { approveChange, rejectChange } from "../../data/admin.write.ts"
import type { TutorDeps } from "../../deps.ts"
import { forbidden } from "../../errors.ts"
import type { TutorEnv } from "../../middleware.ts"

// The admin approvals queue. Admin is decided server-side from the verified
// principal's email: the ADMIN_EMAILS allowlist OR a row in the admin table.
export function adminRoutes(deps: TutorDeps) {
  const db = () => deps.db.db

  async function requireAdmin(email: string | undefined): Promise<void> {
    const e = email?.toLowerCase()
    if (!e) throw forbidden()
    if (deps.cfg.adminEmails.includes(e)) return
    if (await adminByEmail(db(), email!)) return
    throw forbidden()
  }

  return new Hono<TutorEnv>()
    .get("/admin/pending-changes", async (c) => {
      await requireAdmin(c.get("user").email)
      return c.json({ changes: await listPendingChanges(db()) })
    })
    .post("/admin/changes/:id/approve", async (c) => {
      await requireAdmin(c.get("user").email)
      return c.json(await approveChange(db(), c.req.param("id")))
    })
    .post("/admin/changes/:id/reject", validate("json", rejectChangeInput), async (c) => {
      await requireAdmin(c.get("user").email)
      return c.json(await rejectChange(db(), c.req.param("id"), c.req.valid("json").note))
    })
}
