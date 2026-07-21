"use server"

import { rejectChangeInput } from "@iedora/product-tutor/contracts/admin"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import * as api from "@iedora/product-tutor/api/admin"
import { adminActionClient } from "@iedora/product-tutor/lib/safe-action"

// Thin admin actions. The tutor service applies the approved change to the real
// tables (re-checking each kind's invariants) and enforces the admin gate against
// the Bearer principal; adminActionClient keeps the web-side gate for a fast reject.

export const approveChangeAction = adminActionClient
  .metadata({ actionName: "admin.approveChange" })
  .inputSchema(z.object({ changeId: z.string().min(1) }))
  .action(async ({ parsedInput }) => {
    const res = await api.approveChange(parsedInput.changeId)
    revalidatePath("/", "layout")
    return res
  })

export const rejectChangeAction = adminActionClient
  .metadata({ actionName: "admin.rejectChange" })
  .inputSchema(rejectChangeInput.extend({ changeId: z.string().min(1) }))
  .action(async ({ parsedInput }) => {
    const res = await api.rejectChange(parsedInput.changeId, parsedInput.note)
    revalidatePath("/settings", "layout")
    return res
  })
