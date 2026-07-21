import { confirmCardSetupInput, lessonPaymentInput } from "@iedora/tutor-contracts/payments"
import { validate } from "@iedora/service-kit"
import { Hono } from "hono"

import {
  confirmOneOffPayment,
  createCardSetupIntent,
  getSavedCard,
  saveDefaultPaymentMethod,
  startOneOffCheckout,
} from "../../data/payments"
import { studentByUserId } from "../../data/students"
import type { TutorDeps } from "../../deps"
import { notFound } from "../../errors"
import type { TutorEnv } from "../../middleware"

// The student's own payment surface: saved card + one-off checkout. Billing owns
// Stripe; the student is resolved from the Bearer principal. The recurring off-
// session charge + auto-release run in the Inngest jobs (still hosted where the
// scheduler can reach them), not here.
export function paymentsRoutes(deps: TutorDeps) {
  const db = () => deps.db.db

  return new Hono<TutorEnv>()
    .get("/payments/saved-card", async (c) => {
      const s = await studentByUserId(db(), c.get("user").userId)
      return c.json(s ? await getSavedCard(db(), s.id) : null)
    })
    .post("/payments/card-setup", async (c) => {
      const s = await studentByUserId(db(), c.get("user").userId)
      if (!s) throw notFound()
      return c.json(await createCardSetupIntent(db(), deps.billing, { studentId: s.id }))
    })
    .post("/payments/card", validate("json", confirmCardSetupInput), async (c) => {
      const s = await studentByUserId(db(), c.get("user").userId)
      if (!s) throw notFound()
      const { paymentMethodId } = c.req.valid("json")
      await saveDefaultPaymentMethod(db(), deps.billing, { studentId: s.id, paymentMethodId })
      return c.json({ ok: true as const })
    })
    .post("/payments/lesson/checkout", validate("json", lessonPaymentInput), async (c) => {
      const s = await studentByUserId(db(), c.get("user").userId)
      if (!s) throw notFound()
      const { lessonId } = c.req.valid("json")
      return c.json(await startOneOffCheckout(db(), deps.billing, { studentId: s.id, lessonId }))
    })
    .post("/payments/lesson/confirm", validate("json", lessonPaymentInput), async (c) => {
      const s = await studentByUserId(db(), c.get("user").userId)
      if (!s) throw notFound()
      const { lessonId } = c.req.valid("json")
      await confirmOneOffPayment(db(), { studentId: s.id, lessonId })
      return c.json({ ok: true as const })
    })
}
