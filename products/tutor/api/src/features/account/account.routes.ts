import { updateTimezoneInput } from "@iedora/tutor-contracts/account"
import { isValidTimezone } from "@iedora/tutor-db/domain/time"
import { validate } from "@iedora/service-kit"
import { Hono } from "hono"

import { profileTz, setTimezone } from "../../data/account"
import type { TutorDeps } from "../../deps"
import { invalid, notFound } from "../../errors"
import type { TutorEnv } from "../../middleware"

// Account mutations. Identity from the verified Bearer principal; the timezone
// guard (don't clobber a manual choice) is enforced here.
export function accountRoutes(deps: TutorDeps) {
  const db = () => deps.db.db
  return new Hono<TutorEnv>().post(
    "/account/timezone",
    validate("json", updateTimezoneInput),
    async (c) => {
      const { timezone, source } = c.req.valid("json")
      if (!isValidTimezone(timezone)) throw invalid("Unknown timezone.")
      const profile = await profileTz(db(), c.get("user").userId)
      if (!profile) throw notFound()
      return c.json(await setTimezone(db(), profile, timezone, source))
    },
  )
}
