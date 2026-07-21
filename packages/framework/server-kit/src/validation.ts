import { zValidator } from "@hono/zod-validator"
import type { ValidationTargets } from "hono"
import type { ZodType } from "zod"

import { HttpError } from "./errors.ts"

/** One validator for every route: parse `target` (json / param / query / …) with
 *  `schema`, and on failure raise a standard 422 HttpError so error shapes stay
 *  uniform. Read the parsed value with `c.req.valid(target)`. Works with zod 3.25+
 *  and zod 4. */
export const validate = <Target extends keyof ValidationTargets, S extends ZodType>(
  target: Target,
  schema: S,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new HttpError(422, "invalid_input", result.error.issues[0]?.message)
    }
  })
