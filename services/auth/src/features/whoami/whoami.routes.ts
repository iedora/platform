import { type UserEnv, userAuth } from "@iedora/menu-kit";
import { Hono } from "hono";
import { decodeJwt } from "jose";

import { findUserById } from "../../data/users";
import type { AuthDeps } from "../../deps";

// The signed-in user's identity — the @iedora/auth-sdk WhoAmI shape.
// `mustChangePassword` is read LIVE from the DB so the dashboard guard stops
// redirecting the instant the user completes a forced change (the token claim
// would lag); everything else comes off the verified access token.
export function whoamiRoutes(deps: AuthDeps) {
  return new Hono<UserEnv>().get("/whoami", userAuth(deps.userVerifier), async (c) => {
    const u = c.get("user");
    const row = await findUserById(deps.db.db, u.userId);
    // The bearer is already verified by userAuth; decode (no verify) just for `exp`.
    const bearer = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const exp = bearer ? ((decodeJwt(bearer).exp as number | undefined) ?? 0) : 0;
    return c.json({
      sub: u.userId,
      email: u.email ?? null,
      name: row?.name ?? null,
      tenant: u.tenant ?? "menu",
      org: u.org ?? null,
      roles: u.roles,
      mustChangePassword: row?.must_change_password ?? false,
      exp,
    });
  });
}
