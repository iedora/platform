import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";

import type { MenuDeps } from "../../deps";
import type { MenuEnv } from "../../middleware";

const uploadInput = z.object({
  target: z.string(),
  contentType: z.string().optional(),
  key: z.string().optional(),
  itemId: z.string().optional(),
});

// Upload slice (scoped, under /restaurants/{slug}): presign → commit → clear.
// 503 when storage is unconfigured (deps.uploads === null). Each handler is
// rate-limited by its policy.
export function uploadsRoutes(deps: MenuDeps) {
  // Returns a 503 Response when storage is unconfigured, else applies the
  // surface's rate-limit policy and returns null (proceed).
  const guard = async (c: Context<MenuEnv>, policy: string): Promise<Response | null> => {
    if (!deps.uploads) return c.json({ error: "uploads not configured" }, 503);
    await deps.limiter.allow(policy, `org:${c.get("restaurant").tenantId}`);
    return null;
  };

  return new Hono<MenuEnv>()
    .post("/uploads/presign", zValidator("json", uploadInput), async (c) => {
      const blocked = await guard(c, "presign");
      if (blocked) return blocked;
      const { target, contentType, itemId } = c.req.valid("json");
      return c.json(await deps.uploads!.presign(c.get("restaurant"), target, contentType ?? "", itemId ?? ""));
    })
    .post("/uploads/commit", zValidator("json", uploadInput), async (c) => {
      const blocked = await guard(c, "commit");
      if (blocked) return blocked;
      const { target, key, itemId } = c.req.valid("json");
      return c.json({ url: await deps.uploads!.commit(c.get("restaurant"), target, key ?? "", itemId ?? "") });
    })
    .post("/uploads/clear", zValidator("json", uploadInput), async (c) => {
      const blocked = await guard(c, "clear");
      if (blocked) return blocked;
      const { target, itemId } = c.req.valid("json");
      await deps.uploads!.clear(c.get("restaurant"), target, itemId ?? "");
      return c.json({ ok: true });
    });
}
