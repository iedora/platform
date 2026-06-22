import { createServiceApp, healthRoutes } from "@iedora/server-kit";
import { Hono } from "hono";

import type { AuthDeps } from "./deps";
import { jwksRoutes } from "./features/jwks/jwks.routes";
import { loginRoutes } from "./features/login/login.routes";
import { logoutRoutes } from "./features/logout/logout.routes";
import { passwordResetRoutes } from "./features/password-reset/password-reset.routes";
import { refreshRoutes } from "./features/refresh/refresh.routes";
import { registerRoutes } from "./features/register/register.routes";
import { tenantAdminRoutes } from "./features/tenants/tenant-admin.routes";
import { tenantsRoutes } from "./features/tenants/tenants.routes";
import { tokenRoutes } from "./features/token/token.routes";
import { whoamiRoutes } from "./features/whoami/whoami.routes";

// Composition root: mount each auth slice under /auth. Slices own their own
// logic (features/<slice>/); this only wires + exposes /up.
export function buildApp(deps: AuthDeps) {
  const auth = new Hono()
    .route("/", registerRoutes(deps))
    .route("/", loginRoutes(deps))
    .route("/", refreshRoutes(deps))
    .route("/", logoutRoutes(deps))
    .route("/", passwordResetRoutes(deps))
    .route("/", tenantsRoutes(deps))
    .route("/", tenantAdminRoutes(deps))
    .route("/", whoamiRoutes(deps))
    .route("/", tokenRoutes(deps))
    .route("/", jwksRoutes(deps));

  return createServiceApp()
    .route("/", healthRoutes(() => deps.db.ping()))
    .route("/auth", auth);
}

export type AuthApp = ReturnType<typeof buildApp>;
