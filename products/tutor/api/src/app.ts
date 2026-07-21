import { createServiceApp, healthRoutes, userAuth } from "@iedora/service-kit"
import { Hono } from "hono"

import type { TutorDeps } from "./deps.ts"
import { handleError } from "./errors.ts"
import { accountRoutes } from "./features/account/account.routes.ts"
import { adminRoutes } from "./features/admin/admin.routes.ts"
import { bookingRoutes } from "./features/booking/booking.routes.ts"
import { chatRoutes } from "./features/chat/chat.routes.ts"
import { gamificationRoutes } from "./features/gamification/gamification.routes.ts"
import { lessonsRoutes } from "./features/lessons/lessons.routes.ts"
import { paymentsRoutes } from "./features/payments/payments.routes.ts"
import { rescheduleRoutes } from "./features/reschedule/reschedule.routes.ts"
import { sessionRoutes } from "./features/session/session.routes.ts"
import { tutorProfileRoutes } from "./features/tutor-profile/tutor-profile.routes.ts"
import { tutorSettingsRoutes } from "./features/tutor-settings/tutor-settings.routes.ts"
import type { TutorEnv } from "./middleware.ts"

// Composition root. Public health probe, the unauthenticated /public surface (SEO
// landing pages + sitemap), then the authenticated /api surface (every route under
// it verifies the user Bearer via userAuth). Feature slices mount as they migrate
// over from the Next app. `export type TutorApp` is the type the BFF consumes.
export function buildApp(deps: TutorDeps) {
  const api = new Hono<TutorEnv>()
    .use(userAuth(deps.userVerifier))
    .route("/", sessionRoutes(deps))
    .route("/", lessonsRoutes(deps))
    .route("/", chatRoutes(deps))
    .route("/", tutorSettingsRoutes(deps))
    .route("/", adminRoutes(deps))
    .route("/", bookingRoutes(deps))
    .route("/", accountRoutes(deps))
    .route("/", gamificationRoutes(deps))
    .route("/", rescheduleRoutes(deps))
    .route("/", paymentsRoutes(deps))

  const app = createServiceApp<TutorEnv>()
    .route("/", healthRoutes(() => deps.db.ping()))
    .route("/public", tutorProfileRoutes(deps))
    .route("/api", api)

  app.onError(handleError)
  return app
}

export type TutorApp = ReturnType<typeof buildApp>
