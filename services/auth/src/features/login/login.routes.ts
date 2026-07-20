import { loginRequest } from "@iedora/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import type { AuthDeps } from "../../deps";
import { authSession, metaFrom } from "../../session";
import { login } from "./login.service";

export function loginRoutes(deps: AuthDeps) {
  return new Hono().post("/login", zValidator("json", loginRequest), async (c) => {
    const tokens = await login(deps, c.req.valid("json"), metaFrom(c));
    return c.json(authSession(tokens));
  });
}
