import { BillingError, type BillingClient } from "@iedora/sdk/billing"
import { formatPennies, RANK_COMMISSION_RATE } from "#db/domain/pricing"
import { canTransition, PAYMENT_DEADLINE_HOURS } from "#db/domain/status"
import type { LessonStatus } from "#db/enums"
import type { Kysely } from "kysely"

import type { SavedCardDTO } from "#contracts/payments"
import type { TutorDB } from "../schema"
import { WIRE_CURRENCY } from "../lib/billing"
import { conversationId, postSystem } from "./conversations"

type DB = Kysely<TutorDB>

/** The platform commission for a lesson — the rank rate of the lesson's
 *  qualification. Defaults to the bronze rate when there's no qualification. */
export async function lessonFeeRate(db: DB, qualificationId: string | null): Promise<number> {
  if (!qualificationId) return RANK_COMMISSION_RATE.bronze
  const row = await db
    .selectFrom("qualification as q")
    .innerJoin("rank as r", "r.id", "q.rankId")
    .select("r.commissionRate as rate")
    .where("q.id", "=", qualificationId)
    .executeTakeFirst()
  return row?.rate ?? RANK_COMMISSION_RATE.bronze
}

export async function loadLesson(db: DB, lessonId: string) {
  return db
    .selectFrom("lesson")
    .select([
      "id",
      "status",
      "mode",
      "type",
      "pricePennies",
      "qualificationId",
      "studentId",
      "tutorId",
      "startsAtUtc",
    ])
    .where("id", "=", lessonId)
    .executeTakeFirstOrThrow()
}

export async function setStatus(db: DB, lessonId: string, from: LessonStatus, to: LessonStatus, reason: string) {
  if (!canTransition(from, to)) throw new Error(`Illegal transition ${from} → ${to}`)
  await db.updateTable("lesson").set({ status: to }).where("id", "=", lessonId).execute()
  await db.insertInto("lessonEvent").values({ lessonId, fromStatus: from, toStatus: to, reason }).execute()
}

async function payMessage(db: DB, tutorId: string, studentId: string, body: string) {
  const convId = await conversationId(db, tutorId, studentId)
  await postSystem(db, convId, { body, type: "payment_request" })
}

/* -------------------------- recurring off-session charge ------------------ */

export type ChargeOutcome =
  | { result: "paid" }
  | { result: "failed"; reason: "declined" | "authentication_required" | "no_card" }
  | { result: "skipped"; reason: string }

/**
 * Charges a recurring lesson's saved card off-session at the deadline. Stripe can
 * still demand SCA here (`authentication_required`) — recoverable, so it lands in
 * payment_failed with a distinct reason rather than a hard fail. Runs from the
 * Inngest settle job.
 */
export async function chargeLessonOffSession(
  db: DB,
  billing: BillingClient,
  lessonId: string,
): Promise<ChargeOutcome> {
  const lesson = await loadLesson(db, lessonId)

  if (lesson.status !== "booked" && lesson.status !== "charge_due") {
    return { result: "skipped", reason: `lesson is ${lesson.status}` }
  }
  if (lesson.pricePennies <= 0) return { result: "skipped", reason: "free lesson" }

  const convId = await conversationId(db, lesson.tutorId, lesson.studentId)

  const student = await db
    .selectFrom("student")
    .select(["stripeCustomerId", "defaultPaymentMethodId"])
    .where("id", "=", lesson.studentId)
    .executeTakeFirstOrThrow()

  if (lesson.status === "booked") {
    await setStatus(db, lesson.id, "booked", "charge_due", "Charge window reached")
  }

  if (!student.stripeCustomerId || !student.defaultPaymentMethodId) {
    await setStatus(db, lesson.id, "charge_due", "charging", "Charging saved card")
    await setStatus(db, lesson.id, "charging", "payment_failed", "No card on file")
    await postSystem(db, convId, {
      body: "Payment failed — no card on file. Add a card to keep this lesson.",
      type: "payment_request",
    })
    return { result: "failed", reason: "no_card" }
  }

  await setStatus(db, lesson.id, "charge_due", "charging", "Charging saved card")

  const payment = await db
    .insertInto("payment")
    .values({ lessonId: lesson.id, status: "pending", amountPennies: lesson.pricePennies })
    .returning("id")
    .executeTakeFirstOrThrow()

  await db.updateTable("lesson").set({ paymentId: payment.id }).where("id", "=", lesson.id).execute()

  try {
    const feeRate = await lessonFeeRate(db, lesson.qualificationId)
    const charge = await billing.createCharge({
      product: "tutor",
      payer: lesson.studentId,
      payee: lesson.tutorId,
      amountCents: lesson.pricePennies,
      currency: WIRE_CURRENCY,
      kind: "stripe",
      mode: "charge",
      customer: student.stripeCustomerId,
      paymentMethod: student.defaultPaymentMethodId,
      feeRate,
      idempotencyKey: `lesson-${lesson.id}`,
      metadata: { lessonId: lesson.id },
    })

    if (charge.status !== "paid") {
      await db
        .updateTable("payment")
        .set({ status: "action_required", stripePaymentIntentId: charge.id })
        .where("id", "=", payment.id)
        .execute()
      await setStatus(db, lesson.id, "charging", "payment_failed", "Card needs authentication (SCA)")
      await postSystem(db, convId, {
        body: "Your bank needs you to confirm this payment. Tap to authenticate and keep your lesson.",
        type: "payment_request",
      })
      return { result: "failed", reason: "authentication_required" }
    }

    await db
      .updateTable("payment")
      .set({ status: "paid", stripePaymentIntentId: charge.id })
      .where("id", "=", payment.id)
      .execute()
    await setStatus(db, lesson.id, "charging", "paid", "Card charged")
    await postSystem(db, convId, {
      body: `Paid ${formatPennies(lesson.pricePennies)} · charged ${PAYMENT_DEADLINE_HOURS.recurring}h before your lesson`,
      type: "payment_request",
    })
    return { result: "paid" }
  } catch (error) {
    const code = error instanceof BillingError ? error.code : "provider_error"
    const message = error instanceof BillingError ? error.message : "Card declined"
    const sca = code === "authentication_required"
    await db
      .updateTable("payment")
      .set({ status: sca ? "action_required" : "failed", stripePaymentIntentId: null })
      .where("id", "=", payment.id)
      .execute()
    await setStatus(
      db,
      lesson.id,
      "charging",
      "payment_failed",
      sca ? "Card needs authentication (SCA)" : message,
    )
    await postSystem(db, convId, {
      body: sca
        ? "Your bank needs you to confirm this payment. Tap to authenticate and keep your lesson."
        : "Payment failed — your card was declined. Update it to keep this lesson.",
      type: "payment_request",
    })
    return { result: "failed", reason: sca ? "authentication_required" : "declined" }
  }
}

/** One-off lessons: the student pays manually by the deadline (Inngest settle job). */
export async function requestOneOffPayment(db: DB, lessonId: string): Promise<ChargeOutcome> {
  const lesson = await loadLesson(db, lessonId)
  if (lesson.status !== "booked") return { result: "skipped", reason: `lesson is ${lesson.status}` }
  if (lesson.pricePennies <= 0) return { result: "skipped", reason: "free lesson" }

  const convId = await conversationId(db, lesson.tutorId, lesson.studentId)
  await setStatus(db, lesson.id, "booked", "awaiting_payment", "Payment requested")
  await postSystem(db, convId, {
    body: `${formatPennies(lesson.pricePennies)} due — pay to confirm your lesson (${PAYMENT_DEADLINE_HOURS.one_off}h before).`,
    type: "payment_request",
  })
  return { result: "skipped", reason: "awaiting manual payment" }
}

/** Unpaid by the cutoff → the slot goes back (Inngest settle job's recovery step). */
export async function autoReleaseLesson(db: DB, lessonId: string): Promise<boolean> {
  const lesson = await loadLesson(db, lessonId)
  if (lesson.status !== "payment_failed" && lesson.status !== "awaiting_payment") return false

  await setStatus(db, lesson.id, lesson.status, "auto_released", "Unpaid by the cutoff")
  const convId = await conversationId(db, lesson.tutorId, lesson.studentId)
  await postSystem(db, convId, {
    body: "Lesson released — it wasn't paid in time. You can rebook any time.",
    type: "payment_request",
  })
  return true
}

/* ------------------------------ saving a card ----------------------------- */

/**
 * Begin saving a card off-session — billing creates the SetupIntent (and the
 * provider customer if needed); the browser confirms the returned clientSecret
 * with Stripe.js. SCA (3DS) happens there, once.
 */
export async function createCardSetupIntent(
  db: DB,
  billing: BillingClient,
  input: { studentId: string },
): Promise<{ clientSecret: string }> {
  const student = await db
    .selectFrom("student")
    .select("stripeCustomerId")
    .where("id", "=", input.studentId)
    .executeTakeFirstOrThrow()

  const setup = await billing.setupPaymentMethod({
    kind: "stripe",
    customer: student.stripeCustomerId ?? undefined,
    metadata: { studentId: input.studentId },
  })

  // Billing may have created the provider customer — remember it for later charges.
  if (setup.customer && setup.customer !== student.stripeCustomerId) {
    await db
      .updateTable("student")
      .set({ stripeCustomerId: setup.customer })
      .where("id", "=", input.studentId)
      .execute()
  }
  return { clientSecret: setup.clientSecret }
}

/** Once the SetupIntent succeeds on the client: billing retrieves the saved
 *  method's display bits (brand/last4/expiry) and we store them. */
export async function saveDefaultPaymentMethod(
  db: DB,
  billing: BillingClient,
  input: { studentId: string; paymentMethodId: string },
): Promise<void> {
  const card = await billing.getPaymentMethod(input.paymentMethodId)
  await db
    .updateTable("student")
    .set({
      defaultPaymentMethodId: input.paymentMethodId,
      cardBrand: card.brand,
      cardLast4: card.last4,
      cardExpMonth: card.expMonth,
      cardExpYear: card.expYear,
    })
    .where("id", "=", input.studentId)
    .execute()
}

/**
 * What we show the student. Having a payment method is decided by
 * `defaultPaymentMethodId` alone (a Link method is chargeable even with no
 * brand/last4 to display).
 */
export async function getSavedCard(db: DB, studentId: string): Promise<SavedCardDTO | null> {
  const row = await db
    .selectFrom("student")
    .select(["defaultPaymentMethodId", "cardBrand", "cardLast4", "cardExpMonth", "cardExpYear"])
    .where("id", "=", studentId)
    .executeTakeFirst()

  if (!row?.defaultPaymentMethodId) return null

  const now = new Date()
  const expired =
    row.cardExpMonth !== null &&
    row.cardExpYear !== null &&
    (row.cardExpYear < now.getFullYear() ||
      (row.cardExpYear === now.getFullYear() && row.cardExpMonth < now.getMonth() + 1))

  return {
    brand: row.cardBrand ?? "card",
    last4: row.cardLast4,
    expMonth: row.cardExpMonth,
    expYear: row.cardExpYear,
    expired,
    isLink: row.cardBrand === "link",
  }
}

/* ---------------------------- one-off checkout ---------------------------- */

/**
 * Client-initiated one-off checkout: create the PaymentIntent the moment the
 * student pays and return its client secret for the browser to confirm. Records
 * the payment row + billing's charge id + the commission split.
 */
export async function startOneOffCheckout(
  db: DB,
  billing: BillingClient,
  input: { studentId: string; lessonId: string },
): Promise<{ clientSecret: string }> {
  const lesson = await loadLesson(db, input.lessonId)
  if (lesson.studentId !== input.studentId) throw new Error("Not your lesson.")
  if (lesson.status !== "awaiting_payment") throw new Error(`Lesson is ${lesson.status}, not awaiting payment.`)

  const student = await db
    .selectFrom("student")
    .select("stripeCustomerId")
    .where("id", "=", input.studentId)
    .executeTakeFirstOrThrow()

  const charge = await billing.createCharge({
    product: "tutor",
    payer: lesson.studentId,
    payee: lesson.tutorId,
    amountCents: lesson.pricePennies,
    currency: WIRE_CURRENCY,
    kind: "stripe",
    mode: "intent",
    ...(student.stripeCustomerId ? { customer: student.stripeCustomerId } : {}),
    feeRate: await lessonFeeRate(db, lesson.qualificationId),
    idempotencyKey: `lesson-oneoff-${lesson.id}`,
    metadata: { lessonId: lesson.id },
  })
  if (!charge.clientSecret) throw new Error("Billing did not return a client secret.")

  const payment = await db
    .insertInto("payment")
    .values({
      lessonId: lesson.id,
      status: "pending",
      amountPennies: lesson.pricePennies,
      stripePaymentIntentId: charge.id,
    })
    .returning("id")
    .executeTakeFirstOrThrow()
  await db.updateTable("lesson").set({ paymentId: payment.id }).where("id", "=", lesson.id).execute()

  return { clientSecret: charge.clientSecret }
}

/** The student confirmed the PaymentIntent client-side — mark the lesson paid. A
 *  Stripe webhook / billing sync can reconcile the authoritative status later. */
export async function confirmOneOffPayment(
  db: DB,
  input: { studentId: string; lessonId: string },
): Promise<{ result: "paid" | "skipped" }> {
  const lesson = await loadLesson(db, input.lessonId)
  if (lesson.studentId !== input.studentId) throw new Error("Not your lesson.")
  if (lesson.status !== "awaiting_payment") return { result: "skipped" }

  const payment = await db
    .selectFrom("payment")
    .select("id")
    .where("lessonId", "=", lesson.id)
    .where("status", "=", "pending")
    .executeTakeFirst()
  if (payment) await db.updateTable("payment").set({ status: "paid" }).where("id", "=", payment.id).execute()

  await setStatus(db, lesson.id, "awaiting_payment", "paid", "Paid")
  await payMessage(db, lesson.tutorId, lesson.studentId, `Paid ${formatPennies(lesson.pricePennies)} — your lesson is confirmed.`)
  return { result: "paid" }
}

/* -------------------------------- refunds --------------------------------- */

/**
 * Refunds a lesson's payment through billing. The lesson's own status keeps
 * saying *why* (e.g. tutor_no_show); the money outcome lives on the payment
 * aggregate. No-op if nothing was charged.
 */
export async function refundLessonPayment(
  db: DB,
  billing: BillingClient,
  lessonId: string,
): Promise<boolean> {
  const payment = await db
    .selectFrom("payment")
    .select(["id", "status", "stripePaymentIntentId", "amountPennies"])
    .where("lessonId", "=", lessonId)
    .where("status", "=", "paid")
    .executeTakeFirst()

  if (!payment?.stripePaymentIntentId) return false

  await billing.refundCharge(payment.stripePaymentIntentId, {})

  await db
    .updateTable("payment")
    .set({ status: "refunded", refundedAt: new Date() })
    .where("id", "=", payment.id)
    .execute()

  const lesson = await db
    .selectFrom("lesson")
    .select(["tutorId", "studentId"])
    .where("id", "=", lessonId)
    .executeTakeFirstOrThrow()
  await payMessage(db, lesson.tutorId, lesson.studentId, `Refunded ${formatPennies(payment.amountPennies)} to your card.`)
  return true
}
