import { type UserEnv, userAuth } from "@iedora/menu-kit";
import { Hono } from "hono";

import type { AuthDeps } from "../../deps";
import { metaFrom } from "../../session";
import { logout, logoutAll } from "./logout.service";

export function logoutRoutes(deps: AuthDeps) {
  return new Hono<UserEnv>()
    .post("/logout", async (c) => {
      // Refresh token in the body; the BFF clears its own cookies.
      const body = await c.req
        .json<{ refreshToken?: string }>()
        .catch(() => ({}) as { refreshToken?: string });
      if (body.refreshToken) await logout(deps, body.refreshToken, metaFrom(c));
      return c.json({ ok: true });
    })
    .post("/logout-all", userAuth(deps.userVerifier), async (c) => {
      await logoutAll(deps, c.get("user").userId, metaFrom(c));
      return c.json({ ok: true });
    });
}
