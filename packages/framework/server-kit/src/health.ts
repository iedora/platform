import type { Context } from "hono"

/** Liveness handler: `app.get("/up", up)` → `200 {"ok":true}`. */
export const up = (c: Context) => c.json({ ok: true })
