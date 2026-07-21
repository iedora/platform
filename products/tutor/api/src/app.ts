import { createServiceApp, healthRoutes, userAuth } from "@iedora/service-kit"
import { Hono } from "hono"

import type { TutorDeps } from "./deps"
import { handleError } from "./errors"
import { accountRoutes } from "./features/account/account.routes"
import { adminRoutes } from "./features/admin/admin.routes"
import { bookingRoutes } from "./features/booking/booking.routes"
import { chatRoutes } from "./features/chat/chat.routes"
import { gamificationRoutes } from "./features/gamification/gamification.routes"
import { lessonsRoutes } from "./features/lessons/lessons.routes"
import { paymentsRoutes } from "./features/payments/payments.routes"
import { rescheduleRoutes } from "./features/reschedule/reschedule.routes"
import { sessionRoutes } from "./features/session/session.routes"
import { tutorProfileRoutes } from "./features/tutor-profile/tutor-profile.routes"
import { tutorSettingsRoutes } from "./features/tutor-settings/tutor-settings.routes"
import type { TutorEnv } from "./middleware"

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
