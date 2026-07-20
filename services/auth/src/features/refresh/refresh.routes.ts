import { Hono } from "hono";

import type { AuthDeps } from "../../deps";
import { unauthorized } from "../../errors";
import { metaFrom, tokenBundle } from "../../session";
import { refresh } from "./refresh.service";

export function refreshRoutes(deps: AuthDeps) {
  return new Hono().post("/refresh", async (c) => {
    // The refresh token arrives in the body (the BFF owns the cookie now).
    const body = await c.req
      .json<{ refreshToken?: string }>()
      .catch(() => ({}) as { refreshToken?: string });
    if (!body.refreshToken) throw unauthorized("no refresh token");
    const refreshToken = body.refreshToken;
    const tokens = await refresh(deps, refreshToken, metaFrom(c));
    return c.json(tokenBundle(tokens));
  });
}
