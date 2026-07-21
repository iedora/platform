import {
  addQualificationInput,
  removeQualificationInput,
  toggleReviewPinInput,
  updateProfileInput,
  updateRateInput,
} from "#contracts/tutor-settings"
import { validate } from "@iedora/service-kit"
import { Hono } from "hono"

import { tutorByUserId } from "../../data/students.ts"
import {
  getTutorPendingChanges,
  getTutorProfile,
  getTutorQualifications,
  getTutorSettingsReviews,
} from "../../data/tutor-settings.ts"
import {
  addQualification,
  removeQualification,
  toggleReviewPin,
  updateProfile,
  updateRate,
} from "../../data/tutor-settings.write.ts"
import type { TutorDeps } from "../../deps.ts"
import { forbidden, notFound } from "../../errors.ts"
import type { TutorEnv } from "../../middleware.ts"

// A tutor's own settings reads. The tutor is resolved from the verified Bearer
// principal; a caller with no tutor profile is forbidden (these are tutor-only).
export function tutorSettingsRoutes(deps: TutorDeps) {
  const db = () => deps.db.db
  const tutorId = async (userId: string) => {
    const tutor = await tutorByUserId(db(), userId)
    if (!tutor) throw forbidden()
    return tutor.id
  }
  return new Hono<TutorEnv>()
    .get("/settings/profile", async (c) => {
      const profile = await getTutorProfile(db(), await tutorId(c.get("user").userId))
      if (!profile) throw notFound()
      return c.json(profile)
    })
    .get("/settings/qualifications", async (c) => {
      return c.json(await getTutorQualifications(db(), await tutorId(c.get("user").userId)))
    })
    .get("/settings/reviews", async (c) => {
      return c.json({ reviews: await getTutorSettingsReviews(db(), await tutorId(c.get("user").userId)) })
    })
    .get("/settings/pending-changes", async (c) => {
      return c.json({ changes: await getTutorPendingChanges(db(), await tutorId(c.get("user").userId)) })
    })
    .post("/settings/profile", validate("json", updateProfileInput), async (c) => {
      return c.json(await updateProfile(db(), await tutorId(c.get("user").userId), c.req.valid("json")))
    })
    .post("/settings/rate", validate("json", updateRateInput), async (c) => {
      return c.json(await updateRate(db(), await tutorId(c.get("user").userId), c.req.valid("json")))
    })
    .post("/settings/qualifications", validate("json", addQualificationInput), async (c) => {
      const t = await tutorId(c.get("user").userId)
      return c.json(await addQualification(db(), t, c.req.valid("json").subjectId))
    })
    .post("/settings/qualifications/remove", validate("json", removeQualificationInput), async (c) => {
      const t = await tutorId(c.get("user").userId)
      return c.json(await removeQualification(db(), t, c.req.valid("json").qualificationId))
    })
    .post("/settings/review-pin", validate("json", toggleReviewPinInput), async (c) => {
      return c.json(await toggleReviewPin(db(), await tutorId(c.get("user").userId), c.req.valid("json")))
    })
}
