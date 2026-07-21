import { Hono } from "hono"

import { accountRoutes } from "./features/account/account.routes"
import { loginRoutes } from "./features/login/login.routes"
import { logoutRoutes } from "./features/logout/logout.routes"
import { manageRoutes } from "./features/manage/manage.routes"
import { oauthRoutes } from "./features/oauth/oauth.routes"
import { organizationRoutes } from "./features/organizations/organizations.routes"
import { passwordResetRoutes } from "./features/password-reset/password-reset.routes"
import { refreshRoutes } from "./features/refresh/refresh.routes"
import { registerRoutes } from "./features/register/register.routes"
import { tenantsRoutes } from "./features/tenants/tenants.routes"
import { tokenRoutes } from "./features/token/token.routes"
import { wellKnownRoutes } from "./features/well-known/well-known.routes"
import { whoamiRoutes } from "./features/whoami/whoami.routes"
import { createDispatcher } from "@iedora/messaging"
import { up } from "@iedora/server-kit"

import { auditHandler } from "./platform/audit"
import { config } from "./platform/config"
import { db } from "./platform/db"
import { type Env, onError, withTenant } from "./platform/http"
import { emailHandler } from "./platform/mailer"

const app = new Hono()
app.onError(onError)
app.get("/up", up)

// Root scope: discovery + admin provisioning (no tenant in the path).
app.route("/", wellKnownRoutes)
app.route("/", tenantsRoutes)
app.route("/", tokenRoutes)
app.route("/", manageRoutes)

// Tenant scope: every slice below runs under `/:tenant/...` with the tenant
// resolved once by the middleware.
const tenant = new Hono<Env>()
tenant.use("*", withTenant)
tenant.route("/", registerRoutes)
tenant.route("/", loginRoutes)
tenant.route("/", passwordResetRoutes)
tenant.route("/", refreshRoutes)
tenant.route("/", logoutRoutes)
tenant.route("/", whoamiRoutes)
tenant.route("/", accountRoutes)
tenant.route("/", organizationRoutes)
tenant.route("/", oauthRoutes)
app.route("/:tenant", tenant)

Bun.serve({ port: config.port, fetch: app.fetch })

// One outbox dispatcher delivers every queued message over the SDK: email to the
// email service, audit events to the audit service (both idempotent — the sink
// service dedupes on the outbox message id).
const dispatcher = createDispatcher(db, {
  handlers: { email: emailHandler, audit: auditHandler },
})
dispatcher.start()

console.log(`[auth] listening on :${config.port} — issuer ${config.issuerUrl}`)

// Named (not default) so Bun doesn't auto-serve a second instance; handy for tests.
export { app }
