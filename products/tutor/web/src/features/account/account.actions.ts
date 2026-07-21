"use server"

import { updateTimezoneInput } from "@iedora/product-tutor/contracts/account"
import { revalidatePath } from "next/cache"

import { updateTimezone } from "@iedora/product-tutor/api/account"
import { authActionClient } from "@iedora/product-tutor/lib/safe-action"

/**
 * Sets the zone every time in the app is rendered in. The "don't clobber a manual
 * choice" rule is enforced by the tutor service (which owns the profile); this
 * action is a thin authed wrapper that forwards and revalidates.
 */
export const updateTimezoneAction = authActionClient
  .metadata({ actionName: "account.updateTimezone" })
  .inputSchema(updateTimezoneInput)
  .action(async ({ parsedInput }) => {
    const result = await updateTimezone(parsedInput)
    // Times render server-side in the viewer's zone; every screen is now stale.
    if (result.changed) revalidatePath("/", "layout")
    return result
  })
