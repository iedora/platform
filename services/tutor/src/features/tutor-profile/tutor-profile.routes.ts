import { Hono } from "hono"

import type { TutorDeps } from "../../deps"
import { notFound } from "../../errors"
import type { TutorEnv } from "../../middleware"
import {
  getTutorBooking,
  getTutorIdBySlug,
  getTutorReviews,
  listBookableTutors,
  listPublicTutorSlugs,
} from "../../data/tutor-profile"

// Public tutor-profile surface (no auth): the /t/[slug] landing page, its reviews
// page, and the sitemap all read through here. Mounted under /public.
export function tutorProfileRoutes(deps: TutorDeps) {
  const db = () => deps.db.db
  return new Hono<TutorEnv>()
    .get("/tutors/by-slug/:slug", async (c) => {
      const id = await getTutorIdBySlug(db(), c.req.param("slug"))
      if (!id) throw notFound()
      return c.json({ id })
    })
    .get("/tutors/:id/booking", async (c) => {
      const booking = await getTutorBooking(db(), c.req.param("id"))
      if (!booking) throw notFound()
      return c.json(booking)
    })
    .get("/tutors/:id/reviews", async (c) => {
      return c.json(await getTutorReviews(db(), c.req.param("id")))
    })
    .get("/tutor-slugs", async (c) => {
      return c.json({ slugs: await listPublicTutorSlugs(db()) })
    })
    .get("/bookable-tutors", async (c) => {
      return c.json({ tutors: await listBookableTutors(db()) })
    })
}
